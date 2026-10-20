#include "solve_worker.h"

#include "solve_domain_generated.h"
#include "solve_translation_generated.h"
#include "solver.h"

#include <exception>
#include <string>
#include <utility>

namespace addon {

/**
 * Creates a worker that reports the progress of the solve to a JavaScript
 * callback.
 *
 * @param {Napi::Env} env the environment the worker runs in
 * @param {std::vector<uint8_t>} request the encoded FlatBuffers SolveRequest
 * @param {Napi::Function} callback the callback that receives the progress of the solve
 */
SolveWorker::SolveWorker(Napi::Env env, std::vector<uint8_t> request, Napi::Function callback)
	: Napi::AsyncWorker(env, "solver::solve")
	, _request(std::move(request))
	, _deferred(Napi::Promise::Deferred::New(env))
	, _tsfn(Napi::ThreadSafeFunction::New(env, callback, "solve progress callback", 0, 1))
{
}

/**
 * Creates a worker that solves without reporting the progress.
 *
 * @param {Napi::Env} env the environment the worker runs in
 * @param {std::vector<uint8_t>} request the encoded FlatBuffers SolveRequest
 */
SolveWorker::SolveWorker(Napi::Env env, std::vector<uint8_t> request)
	: Napi::AsyncWorker(env, "solver::solve")
	, _request(std::move(request))
	, _deferred(Napi::Promise::Deferred::New(env))
{
}

/**
 * Returns the promise that is settled with the result of the solve.
 *
 * @returns {Napi::Promise} the promise of the worker
 */
Napi::Promise SolveWorker::Promise()
{
	return _deferred.Promise();
}

/**
 * Runs the solve and encodes the response.
 *
 * The prebuild links the unwinder statically, so an exception that leaves
 * the addon is unwound by a different implementation than the rest of the
 * process. Everything that can throw is caught here; node-addon-api only
 * catches std::exception.
 */
void SolveWorker::Execute()
{
	try {
		fbs::SolveRequestT request;
		std::string error;
		if (!fbs::translation::decodeRequest(_request.data(), _request.size(), request, error)) {
			SetError(error);
			return;
		}

		fbs::domain::SolveRequest const domain = fbs::domain::toDomain(request);
		solver::ProgressCallback on_progress;
		if (_tsfn) {
			auto tsfn = _tsfn;
			on_progress = [tsfn](size_t done, size_t total) {
				auto* value = new std::pair<size_t, size_t>(done, total);
				auto const status = tsfn.NonBlockingCall(value, [](Napi::Env env, Napi::Function jsCallback, std::pair<size_t, size_t>* value) {
					jsCallback.Call({ Napi::Number::New(env, static_cast<double>(value->first)), Napi::Number::New(env, static_cast<double>(value->second)) });
					delete value;
				});
				if (status != napi_ok)
					delete value;
			};
		}

		fbs::domain::SolveResponse const response = solver::solve(domain, on_progress);
		fbs::SolveResponseT const encoded = fbs::domain::fromDomain(response);
		_response = fbs::translation::encodeResponse(encoded);
	} catch (std::exception const& e) {
		SetError(e.what());
	} catch (...) {
		SetError("the solver failed with an unknown error");
	}
}

/**
 * Releases the progress callback and resolves the promise with the encoded
 * response.
 */
void SolveWorker::OnOK()
{
	if (_tsfn) {
		_tsfn.BlockingCall(static_cast<void*>(nullptr), [](Napi::Env, Napi::Function, void*) { });
		_tsfn.Release();
	}
	_deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), _response.data(), _response.size()));
}

/**
 * Releases the progress callback and rejects the promise with the error of the
 * solve.
 *
 * @param {Napi::Error} error the error the solve failed with
 */
void SolveWorker::OnError(Napi::Error const& error)
{
	if (_tsfn) {
		_tsfn.BlockingCall(static_cast<void*>(nullptr), [](Napi::Env, Napi::Function, void*) { });
		_tsfn.Release();
	}
	_deferred.Reject(Napi::Error::New(Env(), error.Message()).Value());
}

} // namespace addon

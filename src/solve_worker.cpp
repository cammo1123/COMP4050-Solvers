#include "solve_worker.h"

#include "solve_domain_generated.h"
#include "solve_translation_generated.h"
#include "solver.h"

#include <string>
#include <utility>

namespace addon {

SolveWorker::SolveWorker(Napi::Env env, std::vector<uint8_t> request, Napi::Function callback)
	: Napi::AsyncWorker(env, "solver::solve")
	, _request(std::move(request))
	, _deferred(Napi::Promise::Deferred::New(env))
	, _tsfn(Napi::ThreadSafeFunction::New(env, callback, "solve progress callback", 0, 1))
{
}

SolveWorker::SolveWorker(Napi::Env env, std::vector<uint8_t> request)
	: Napi::AsyncWorker(env, "solver::solve")
	, _request(std::move(request))
	, _deferred(Napi::Promise::Deferred::New(env))
{
}

Napi::Promise SolveWorker::Promise()
{
	return _deferred.Promise();
}

void SolveWorker::Execute()
{
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
			tsfn.NonBlockingCall(value, [](Napi::Env env, Napi::Function jsCallback, std::pair<size_t, size_t>* value) {
				jsCallback.Call({Napi::Number::New(env, value->first), Napi::Number::New(env, value->second)});
				delete value;
			});
		};
	}

	fbs::domain::SolveResponse const response = solver::solve(domain, on_progress);
	fbs::SolveResponseT const encoded = fbs::domain::fromDomain(response);
	_response = fbs::translation::encodeResponse(encoded);
}

void SolveWorker::OnOK()
{
	if (_tsfn) _tsfn.Release();
	_deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), _response.data(), _response.size()));
}

void SolveWorker::OnError(Napi::Error const& error)
{
	if (_tsfn) _tsfn.Release();
	_deferred.Reject(Napi::Error::New(Env(), error.Message()).Value());
}

} // namespace addon

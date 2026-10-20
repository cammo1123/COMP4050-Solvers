#include "info_domain_generated.h"
#include "solve_worker.h"
#include "solver.h"

#include <napi.h>

#include <exception>

using namespace addon;

namespace {

/**
 * Turns the exception that is currently handled into a JavaScript error.
 *
 * The prebuild links the unwinder statically, so an exception that leaves the
 * addon is unwound by a different implementation than the rest of the process.
 * Everything that can throw is therefore caught here: node-addon-api only
 * catches std::exception, and the JS callbacks it wraps are noexcept.
 *
 * @param {Napi::Env} env the environment the JavaScript error is created for
 * @param {string} fallback the message used when the exception is not a std::exception
 */
void reportError(Napi::Env env, char const* fallback)
{
	try {
		throw;
	} catch (std::exception const& e) {
		Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
	} catch (...) {
		Napi::Error::New(env, fallback).ThrowAsJavaScriptException();
	}
}

} // namespace

/**
 * Returns the build information of the solver as a FlatBuffers buffer.
 *
 * @param {Napi::CallbackInfo} cbInfo the callback information of the JavaScript call
 * @returns {Napi::Value} a Buffer with the encoded InfoResponse
 */
Napi::Value info(Napi::CallbackInfo const& cbInfo)
{
	Napi::Env env = cbInfo.Env();
	try {
		flatbuffers::FlatBufferBuilder builder;
		auto const value = fbs::domain::fromDomain(solver::info());
		builder.Finish(fbs::InfoResponse::Pack(builder, &value));
		return Napi::Buffer<uint8_t>::Copy(env, builder.GetBufferPointer(), builder.GetSize());
	} catch (...) {
		reportError(env, "info failed with an unknown error");
		return env.Undefined();
	}
}

/**
 * Starts the solver and reports the result through a promise.
 *
 * The first argument has to be a Buffer with an encoded FlatBuffers
 * SolveRequest. An optional second argument is a callback that receives the
 * progress of the solve as (done, total) pairs.
 *
 * @param {Napi::CallbackInfo} cbInfo the callback information of the JavaScript call
 * @returns {Napi::Value} a Promise that resolves with a Buffer holding the encoded SolveResponse
 */
Napi::Value solve(Napi::CallbackInfo const& cbInfo)
{
	Napi::Env env = cbInfo.Env();
	if (cbInfo.Length() < 1 || !cbInfo[0].IsBuffer()) {
		Napi::TypeError::New(env, "solve expects a Buffer containing a FlatBuffers SolveRequest").ThrowAsJavaScriptException();
		return env.Null();
	}

	try {
		Napi::Buffer<uint8_t> requestBytes = cbInfo[0].As<Napi::Buffer<uint8_t>>();
		std::vector<uint8_t> request(requestBytes.Data(), requestBytes.Data() + requestBytes.Length());

		SolveWorker* worker;
		if (cbInfo.Length() >= 2 && cbInfo[1].IsFunction()) {
			worker = new SolveWorker(env, std::move(request), cbInfo[1].As<Napi::Function>());
		} else {
			worker = new SolveWorker(env, std::move(request));
		}

		worker->Queue();
		return worker->Promise();
	} catch (...) {
		reportError(env, "solve failed with an unknown error");
		return env.Undefined();
	}
}

/**
 * Registers the exports of the addon.
 *
 * @param {Napi::Env} env the environment the addon is initialised in
 * @param {Napi::Object} exports the object the addon exports are added to
 * @returns {Napi::Object} the exports of the addon
 */
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	try {
		exports.Set(Napi::String::New(env, "info"), Napi::Function::New(env, info));
		exports.Set(Napi::String::New(env, "solve"), Napi::Function::New(env, solve));
	} catch (...) {
		reportError(env, "the addon failed to initialise");
	}
	return exports;
}

NODE_API_MODULE(addon, Init)

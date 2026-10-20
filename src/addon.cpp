#include "info_domain_generated.h"
#include "solve_worker.h"
#include "solver.h"

#include <napi.h>

#include <exception>

using namespace addon;

namespace {

// The prebuild links the unwinder statically, so an exception that leaves the
// addon is unwound by a different implementation than the rest of the process.
// Everything that can throw is therefore caught here: node-addon-api only
// catches std::exception, and the JS callbacks it wraps are noexcept.
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

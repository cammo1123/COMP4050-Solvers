#include "solve_worker.h"

#include <napi.h>

using namespace addon;

Napi::Value info(Napi::CallbackInfo const& cbInfo)
{
	return Napi::String::New(cbInfo.Env(), solver::info());
}

Napi::Value solve(Napi::CallbackInfo const& cbInfo)
{
	Napi::Env env = cbInfo.Env();
	if (cbInfo.Length() < 1 || !cbInfo[0].IsBuffer()) {
		Napi::TypeError::New(env, "solve expects a Buffer containing a FlatBuffers SolveRequest").ThrowAsJavaScriptException();
		return env.Null();
	}

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
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	exports.Set(Napi::String::New(env, "info"), Napi::Function::New(env, info));
	exports.Set(Napi::String::New(env, "solve"), Napi::Function::New(env, solve));
	return exports;
}

NODE_API_MODULE(addon, Init)

#include "doublevalue_translation_generated.h"
#include "solvers.h"
#include <napi.h>

#include <memory>
#include <string>
#include <vector>

Napi::Value hello(Napi::CallbackInfo const& info)
{
	return Napi::String::New(info.Env(), solvers::hello());
}

Napi::Value doubleValue(Napi::CallbackInfo const& info)
{
	Napi::Env env = info.Env();
	if (info.Length() < 1 || !info[0].IsBuffer()) {
		Napi::TypeError::New(env, "doubleValue expects a Buffer containing a FlatBuffers DoubleValueRequest").ThrowAsJavaScriptException();
		return env.Null();
	}

	Napi::Buffer<uint8_t> requestBytes = info[0].As<Napi::Buffer<uint8_t>>();

	myaddon::DoubleValueRequestT request;
	std::string error;
	if (!myaddon::translation::decodeRequest(requestBytes.Data(), requestBytes.Length(), request, error)) {
		Napi::TypeError::New(env, error).ThrowAsJavaScriptException();
		return env.Null();
	}

	myaddon::DoubleValueResponseT response;
	for (auto const& item : request.data) {
		auto value = std::make_unique<myaddon::DataT>();
		value->id = solvers::doubleValue(item->id);
		response.data.push_back(std::move(value));
	}

	std::vector<uint8_t> const responseBytes = myaddon::translation::encodeResponse(response);
	return Napi::Buffer<uint8_t>::Copy(env, responseBytes.data(), responseBytes.size());
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	exports.Set(Napi::String::New(env, "hello"), Napi::Function::New(env, hello));
	exports.Set(Napi::String::New(env, "doubleValue"), Napi::Function::New(env, doubleValue));
	return exports;
}

NODE_API_MODULE(addon, Init)

#include "solve_generated.h"
#include "solve_translation_generated.h"
#include "solvers.h"
#include <napi.h>

#include <memory>
#include <string>
#include <vector>

Napi::Value hello(Napi::CallbackInfo const& info)
{
	return Napi::String::New(info.Env(), solvers::hello());
}

Napi::Value solve(Napi::CallbackInfo const& info)
{
	Napi::Env env = info.Env();
	if (info.Length() < 1 || !info[0].IsBuffer()) {
		Napi::TypeError::New(env, "solve expects a Buffer containing a FlatBuffers DoubleValueRequest").ThrowAsJavaScriptException();
		return env.Null();
	}

	Napi::Buffer<uint8_t> requestBytes = info[0].As<Napi::Buffer<uint8_t>>();

	solver::SolveRequestT request;
	std::string error;
	if (!solver::translation::decodeRequest(requestBytes.Data(), requestBytes.Length(), request, error)) {
		Napi::TypeError::New(env, error).ThrowAsJavaScriptException();
		return env.Null();
	}

	solver::SolveResponseT response;
	for (auto const& item : request.boxes) {
		auto value = std::make_unique<solver::BoxTypeT>();
		value->reference = item->reference;
		value->depth = item->depth;
		value->width = item->width;
		value->length = item->length;
		value->box_weight = item->box_weight;
		value->max_weight = item->max_weight;
		value->maximum_boxes = item->maximum_boxes;
		value->active = item->active;
		response.boxes.push_back(std::move(value));
	}

	std::vector<uint8_t> const responseBytes = solver::translation::encodeResponse(response);
	return Napi::Buffer<uint8_t>::Copy(env, responseBytes.data(), responseBytes.size());
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	exports.Set(Napi::String::New(env, "hello"), Napi::Function::New(env, hello));
	exports.Set(Napi::String::New(env, "solve"), Napi::Function::New(env, solve));
	return exports;
}

NODE_API_MODULE(addon, Init)

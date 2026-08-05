#if !defined(STANDALONE)

#	include "solvers.h"
#	include <napi.h>

Napi::Value hello(Napi::CallbackInfo const& info)
{
	return Napi::String::New(info.Env(), solvers::hello());
}

Napi::Value doubleValue(Napi::CallbackInfo const& info)
{
	Napi::Env env = info.Env();
	if (info.Length() < 1 || !info[0].IsNumber()) {
		Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
		return env.Null();
	}
	double value = info[0].As<Napi::Number>().DoubleValue();
	return Napi::Number::New(env, solvers::doubleValue(value));
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	exports.Set(Napi::String::New(env, "hello"), Napi::Function::New(env, hello));
	exports.Set(Napi::String::New(env, "sendJSON"), Napi::Function::New(env, doubleValue));
	return exports;
}

NODE_API_MODULE(addon, Init)

#endif

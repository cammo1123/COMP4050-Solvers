#include <napi.h>

Napi::Value receiveJSON(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject())
    {
        Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    double arg = info[0].As<Napi::Number>().DoubleValue();
    return Napi::Number::New(env, arg * 2);
}

Napi::String Method(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    return Napi::String::New(env, "Hello from the native C++ side!");
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "hello"), Napi::Function::New(env, Method));
    exports.Set(Napi::String::New(env, "sendJSON"), Napi::Function::New(env, receiveJSON));
    return exports;
}

NODE_API_MODULE(addon, Init)

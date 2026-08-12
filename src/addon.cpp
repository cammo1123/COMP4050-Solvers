#include "solve_domain_generated.h"
#include "solve_generated.h"
#include "solve_translation_generated.h"
#include "solvers.h"
#include <napi.h>

#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

class SolveWorker final : public Napi::AsyncWorker {
public:
	SolveWorker(Napi::Env env, std::vector<uint8_t> request)
		: Napi::AsyncWorker(env, "solvers::solve")
		, _request(std::move(request))
		, _deferred(Napi::Promise::Deferred::New(env))
	{
	}

	Napi::Promise Promise()
	{
		return _deferred.Promise();
	}

protected:
	void Execute() override
	{
		fbs::SolveRequestT request;
		std::string error;
		if (!fbs::translation::decodeRequest(_request.data(), _request.size(), request, error)) {
			SetError(error);
			return;
		}

		fbs::domain::SolveRequest const domain = fbs::domain::toDomain(request);
		fbs::domain::SolveResponse const response = solvers::solve(domain);
		fbs::SolveResponseT const encoded = fbs::domain::fromDomain(response);

		_response = fbs::translation::encodeResponse(encoded);
	}

	void OnOK() override
	{
		_deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), _response.data(), _response.size()));
	}

	void OnError(Napi::Error const& error) override
	{
		_deferred.Reject(Napi::Error::New(Env(), error.Message()).Value());
	}

private:
	std::vector<uint8_t> _request;
	std::vector<uint8_t> _response;
	Napi::Promise::Deferred _deferred;
};

} // namespace

Napi::Value info(Napi::CallbackInfo const& cbInfo)
{
	return Napi::String::New(cbInfo.Env(), solvers::info());
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

	auto* worker = new SolveWorker(env, std::move(request));
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

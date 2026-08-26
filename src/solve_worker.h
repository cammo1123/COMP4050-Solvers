#pragma once

#include <napi.h>

#include <cstdint>
#include <vector>

namespace addon {

class SolveWorker final : public Napi::AsyncWorker {
public:
	SolveWorker(Napi::Env env, std::vector<uint8_t> request, Napi::Function callback);
	SolveWorker(Napi::Env env, std::vector<uint8_t> request);

	Napi::Promise Promise();

protected:
	void Execute() override;
	void OnOK() override;
	void OnError(Napi::Error const& error) override;

private:
	std::vector<uint8_t> _request;
	std::vector<uint8_t> _response;
	Napi::Promise::Deferred _deferred;
	Napi::ThreadSafeFunction _tsfn;
};

} // namespace addon

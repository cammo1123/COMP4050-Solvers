// Blocking PHP extension over solver::solve. FlatBuffers never appears on this
// boundary; marshalling is generated into src/php/gen from fbs/.
//
// guard() is the only frame that handles C++ exceptions, so none can reach the
// Zend C stack. Both entry points run their body inside zend_try: a bailout
// (exit() from a progress callback, a fatal error) longjmps past the C++
// locals, so finish() releases what it can and re-raises the bailout rather
// than letting the request continue as if nothing happened.

#include "bionic_solver_php_runtime.h"

#include "gen/info_php_generated.h"
#include "gen/solve_php_generated.h"

#include "solver.h"

#include <chrono>
#include <cstdint>
#include <exception>
#include <string>
#include <utility>

ZEND_BEGIN_MODULE_GLOBALS(bionic_solver)
ZEND_END_MODULE_GLOBALS(bionic_solver)

ZEND_EXTERN_MODULE_GLOBALS(bionic_solver)

ZEND_DECLARE_MODULE_GLOBALS(bionic_solver)

#define BIONIC_SOLVER_G(v) ZEND_MODULE_GLOBALS_ACCESSOR(bionic_solver, v)

// Class entries are process-global. Keeping these pointers outside module
// globals is required for ZTS, where module globals are thread-local.
static zend_class_entry* exception_ce = nullptr;
static zend_class_entry* algorithm_ce = nullptr;
static zend_class_entry* rotation_policy_ce = nullptr;

ZEND_TSRMLS_CACHE_DEFINE()

namespace bionic {
namespace {

using namespace ::bionic::php;

class ProgressSink final {
public:
	explicit ProgressSink(zval* callable)
	{
		if (absent(callable))
			return;
		ZVAL_COPY(&_callable, callable);
		_active = true;
	}

	~ProgressSink()
	{
		if (_active)
			zval_ptr_dtor(&_callable);
	}

	ProgressSink(ProgressSink const&) = delete;
	ProgressSink& operator=(ProgressSink const&) = delete;

	solver::ProgressCallback callback()
	{
		if (!_active)
			return nullptr;

		zval* callable = &_callable;
		return [callable](size_t done, size_t total) {
			zval params[2];
			ZVAL_LONG(&params[0], static_cast<zend_long>(done));
			ZVAL_LONG(&params[1], static_cast<zend_long>(total));
			zval result;
			ZVAL_UNDEF(&result);

			if (call_user_function(EG(function_table), nullptr, callable, &result, 2, params) == FAILURE) {
				zval_ptr_dtor(&result);
				throw ProgressAborted { };
			}
			zval_ptr_dtor(&result);
			if (EG(exception))
				throw ProgressAborted { };
		};
	}

private:
	zval _callable;
	bool _active = false;
};

enum class Failure : std::uint8_t {
	None,
	Value,
	Runtime,
	Aborted
};

struct Outcome {
	Failure failure = Failure::None;
	bool bailed = false;
	std::string message;
	zval value { };
};

void discard(Outcome& outcome)
{
	if (Z_TYPE(outcome.value) == IS_ARRAY)
		zval_ptr_dtor(&outcome.value);
	ZVAL_UNDEF(&outcome.value);
}

// Runs body(out), carrying the value it produces in outcome.value. Every C++
// exception is translated into a Failure; nothing escapes this frame.
template<typename Body>
void guard(Outcome& outcome, Body&& body) noexcept
{
	ZVAL_UNDEF(&outcome.value);
	try {
		body(outcome.value);
	} catch (ProgressAborted const&) {
		discard(outcome);
		outcome.failure = Failure::Aborted;
	} catch (ValueError const& error) {
		discard(outcome);
		outcome.failure = Failure::Value;
		outcome.message = error.message;
	} catch (std::exception const& error) {
		discard(outcome);
		outcome.failure = Failure::Runtime;
		outcome.message = error.what();
	} catch (...) {
		discard(outcome);
		outcome.failure = Failure::Runtime;
		outcome.message = "the solver failed with an unknown error";
	}
}

void run_guarded(HashTable* request, zval* on_progress, Outcome& outcome) noexcept
{
	guard(outcome, [&](zval& out) {
		fbs::domain::SolveRequest const parsed = readSolveRequest(request, "request");
		ProgressSink sink(on_progress);

		auto const started = std::chrono::steady_clock::now();
		fbs::domain::SolveResponse const response = solver::solve(parsed, sink.callback());
		auto const elapsed = std::chrono::steady_clock::now() - started;

		auto const micros = std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count();
		array_init_size(&out, 4);
		writeSolveResponse(&out, response);
		add_assoc_long(&out, "serverUs", static_cast<zend_long>(micros));
	});
}

void run_guarded_info(Outcome& outcome) noexcept
{
	guard(outcome, [&](zval& out) {
		fbs::domain::InfoResponse const info = solver::info();
		array_init_size(&out, 10);
		writeInfoResponse(&out, info);
	});
}

void throw_outcome(Outcome& outcome)
{
	switch (outcome.failure) {
	case Failure::Aborted:
		// The progress callback raised; its exception is already pending.
		return;
	case Failure::Value:
		zend_value_error("%s", outcome.message.c_str());
		return;
	case Failure::Runtime:
		zend_throw_exception(exception_ce, outcome.message.c_str(), 0);
		return;
	case Failure::None:
		return;
	}
}

// Shared tail for both internal functions: re-raises a bailout that crossed
// the zend_try frame, converts a recorded failure into the matching PHP error,
// and always leaves return_value in a defined state.
void finish(Outcome& outcome, zval* return_value) noexcept
{
	if (outcome.bailed) {
		// C++ members of outcome unwind normally; only the bailout keeps
		// travelling, so exit() and fatal errors still terminate the request.
		discard(outcome);
		zend_bailout();
	}

	throw_outcome(outcome);
	if (outcome.failure != Failure::None) {
		ZVAL_NULL(return_value);
		return;
	}

	ZVAL_COPY_VALUE(return_value, &outcome.value);
}

} // namespace
} // namespace bionic

// ZEND_NS_FE token-pastes the handler name, so it is the bare `solve` here.
PHP_FUNCTION(solve)
{
	zval* request = nullptr;
	zval* on_progress = nullptr;

	ZEND_PARSE_PARAMETERS_START(1, 2)
	Z_PARAM_ARRAY(request)
	Z_PARAM_OPTIONAL
	Z_PARAM_ZVAL_OR_NULL(on_progress)
	ZEND_PARSE_PARAMETERS_END();

	bionic::Outcome outcome;
	zend_try
	{
		bionic::run_guarded(Z_ARRVAL_P(request), on_progress, outcome);
	}
	zend_catch
	{
		outcome.bailed = true;
	}
	zend_end_try();

	bionic::finish(outcome, return_value);
}

PHP_FUNCTION(info)
{
	ZEND_PARSE_PARAMETERS_NONE();

	bionic::Outcome outcome;
	zend_try
	{
		bionic::run_guarded_info(outcome);
	}
	zend_catch
	{
		outcome.bailed = true;
	}
	zend_end_try();

	bionic::finish(outcome, return_value);
}

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_bionic_solver_solve, 0, 1, IS_ARRAY, 0)
ZEND_ARG_TYPE_INFO(0, request, IS_ARRAY, 0)
ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, onProgress, IS_CALLABLE, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_bionic_solver_info, 0, 0, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

static zend_function_entry bionic_solver_functions[] = {
	ZEND_NS_FE("Bionic\\Solver", solve, arginfo_bionic_solver_solve)
		ZEND_NS_FE("Bionic\\Solver", info, arginfo_bionic_solver_info)
			PHP_FE_END
};

static PHP_MINIT_FUNCTION(bionic_solver)
{
	ZEND_TSRMLS_CACHE_UPDATE();

	zend_class_entry exception_ce;
	INIT_CLASS_ENTRY(exception_ce, "Bionic\\Solver\\Exception", nullptr);
	::exception_ce = zend_register_internal_class_ex(&exception_ce, zend_ce_exception);

	zend_class_entry algorithm_ce;
	INIT_CLASS_ENTRY(algorithm_ce, "Bionic\\Solver\\Algorithm", nullptr);
	::algorithm_ce = zend_register_internal_class(&algorithm_ce);

	zend_class_entry rotation_policy_ce;
	INIT_CLASS_ENTRY(rotation_policy_ce, "Bionic\\Solver\\RotationPolicy", nullptr);
	::rotation_policy_ce = zend_register_internal_class(&rotation_policy_ce);

	for (auto const& constant : bionic::php::solveAlgorithmConstants())
		zend_declare_class_constant_long(::algorithm_ce, constant.name, constant.name_length, constant.value);

	for (auto const& constant : bionic::php::rotationPolicyConstants())
		zend_declare_class_constant_long(::rotation_policy_ce, constant.name, constant.name_length, constant.value);

	return SUCCESS;
}

static PHP_RINIT_FUNCTION(bionic_solver)
{
#if defined(ZTS) && defined(COMPILE_DL_BIONIC_SOLVER)
	// MINIT runs once, on one thread; every other thread's TSRMLS cache is
	// still empty, and BIONIC_SOLVER_G is read on the exception path.
	ZEND_TSRMLS_CACHE_UPDATE();
#endif

	return SUCCESS;
}

zend_module_entry bionic_solver_module_entry = {
	STANDARD_MODULE_HEADER,
	// A conventional module name: extension_loaded() and composer's
	// ext-bionic_solver platform check key on this, not on the Bionic\Solver
	// function namespace.
	"bionic_solver",
	bionic_solver_functions,
	PHP_MINIT(bionic_solver),
	nullptr,
	PHP_RINIT(bionic_solver),
	nullptr,
	nullptr,
	PHP_VERSION,
	PHP_MODULE_GLOBALS(bionic_solver),
	nullptr,
	nullptr,
	nullptr,
	STANDARD_MODULE_PROPERTIES_EX
};

#ifdef COMPILE_DL_BIONIC_SOLVER
ZEND_GET_MODULE(bionic_solver)
#endif

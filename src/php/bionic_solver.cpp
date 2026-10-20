// Blocking PHP extension over solver::solve. FlatBuffers never appears on this
// boundary; marshalling is generated into src/php/gen from fbs/.
//
// guard() is the only frame that handles C++ exceptions, so none can reach the
// Zend C stack. Both entry points run their body inside zend_try: a bailout
// (exit() from a progress callback, a fatal error) longjmps past the C++
// locals, so finish() releases what it can and re-raises the bailout rather
// than letting the request continue as if nothing happened.
//
// A bailout raised inside the progress callback is caught one frame deeper, in
// ProgressSink::invoke, so that the C++ objects between the callback and the
// module boundary are destroyed before the bailout is re-raised. A longjmp
// would otherwise skip their destructors.

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

enum class Failure : std::uint8_t {
	None,
	Value,
	Runtime,
	Aborted
};

struct Outcome {
	Failure failure = Failure::None;
	// A Zend bailout raised by the progress callback is caught inside the
	// callback so that the C++ frames can unwind first, and is re-raised
	// afterwards. The flag is volatile because it is written across a
	// setjmp/longjmp boundary.
	bool volatile bailed = false;
	std::string message;
	zval value { };
};

// Holds the resolved progress callback and invokes it. The callable zval
// stays owned by the engine: the call information parsed by
// Z_PARAM_FUNC_OR_NULL only borrows it, so the sink keeps the resolved
// zend_fcall_info instead of a copy of the zval.
class ProgressSink final {
public:
	/**
	 * Takes ownership of the resolved callback and the flag that records a
	 * bailout raised by it.
	 */
	ProgressSink(zend_fcall_info fci, zend_fcall_info_cache fcc, bool volatile* bailed)
		: _fci(fci)
		, _fcc(fcc)
		, _bailed(bailed)
	{
	}

	ProgressSink(ProgressSink const&) = delete;
	ProgressSink& operator=(ProgressSink const&) = delete;

	/**
	 * Builds the callback the core calls while it works.
	 *
	 * An absent callback yields no function, which the core treats as "do not
	 * report progress".
	 */
	solver::ProgressCallback callback()
	{
		if (!ZEND_FCI_INITIALIZED(_fci))
			return nullptr;

		ProgressSink* self = this;
		return [self](size_t done, size_t total) {
			self->invoke(done, total);
		};
	}

private:
	/**
	 * Invokes the callback. A bailout inside it (exit(), a fatal error) is
	 * caught here and recorded, because a longjmp straight out of the
	 * callback would skip the destructors of every C++ frame between the
	 * callback and the module boundary.
	 */
	void invoke(size_t done, size_t total)
	{
		zval params[2];
		ZVAL_LONG(&params[0], static_cast<zend_long>(done));
		ZVAL_LONG(&params[1], static_cast<zend_long>(total));
		zval result;
		ZVAL_UNDEF(&result);

		// These are read after a longjmp, so they must not be held in a
		// register across the setjmp.
		bool volatile failed = false;
		bool volatile bailed = false;

		zend_try
		{
			_fci.retval = &result;
			_fci.param_count = 2;
			_fci.params = params;
			_fci.named_params = nullptr;
			failed = zend_call_function(&_fci, &_fcc) == FAILURE;
			zval_ptr_dtor(&result);
		}
		zend_catch
		{
			bailed = true;
		}
		zend_end_try();

		// The bailout is re-raised by finish(), once the C++ frames have
		// unwound. Throwing from here keeps it out of the zend_try block,
		// whose bailout handler would otherwise be left dangling.
		if (bailed) {
			*_bailed = true;
			throw ProgressAborted { };
		}

		if (failed || EG(exception))
			throw ProgressAborted { };
	}

	zend_fcall_info _fci;
	zend_fcall_info_cache _fcc;
	bool volatile* _bailed;
};

/**
 * Releases a partially built result value.
 */
void discard(Outcome& outcome)
{
	if (Z_TYPE(outcome.value) == IS_ARRAY)
		zval_ptr_dtor(&outcome.value);
	ZVAL_UNDEF(&outcome.value);
}

/**
 * Runs body(out), carrying the value it produces in outcome.value. Every C++
 * exception is translated into a Failure; nothing escapes this frame.
 */
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

/**
 * Parses a solve request, runs the core, and marshals the response.
 */
void run_guarded(HashTable* request, zend_fcall_info fci, zend_fcall_info_cache fcc, Outcome& outcome) noexcept
{
	guard(outcome, [&](zval& out) {
		fbs::domain::SolveRequest const parsed = readSolveRequest(request, "request");
		ProgressSink sink(fci, fcc, &outcome.bailed);

		auto const started = std::chrono::steady_clock::now();
		fbs::domain::SolveResponse const response = solver::solve(parsed, sink.callback());
		auto const elapsed = std::chrono::steady_clock::now() - started;

		auto const micros = std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count();
		array_init_size(&out, 4);
		writeSolveResponse(&out, response);
		add_assoc_long(&out, "serverUs", static_cast<zend_long>(micros));
	});
}

/**
 * Collects the build metadata of the core and marshals it.
 */
void run_guarded_info(Outcome& outcome) noexcept
{
	guard(outcome, [&](zval& out) {
		fbs::domain::InfoResponse const info = solver::info();
		array_init_size(&out, 10);
		writeInfoResponse(&out, info);
	});
}

/**
 * Turns a recorded failure into the matching PHP error.
 *
 * An aborted solve leaves the callback's own exception pending, so nothing is
 * thrown here.
 */
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

/**
 * Shared tail for both internal functions: re-raises a bailout that crossed
 * the zend_try frame, converts a recorded failure into the matching PHP error,
 * and always leaves return_value in a defined state.
 */
void finish(Outcome& outcome, zval* return_value) noexcept
{
	if (outcome.bailed) {
		// The bailout was caught so that the C++ frames could unwind; it is
		// re-raised here, once the native buffers have been released.
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

/**
 * Bionic\Solver\solve(): packs the requested items and returns the result.
 *
 * The second argument is an optional progress callback; an invalid one is a
 * TypeError raised while the arguments are parsed.
 */
// ZEND_NS_FE token-pastes the handler name, so it is the bare `solve` here.
PHP_FUNCTION(solve)
{
	zval* request = nullptr;
	// Z_PARAM_FUNC_OR_NULL resolves the callback while the arguments are
	// parsed, so an invalid onProgress is a TypeError here rather than a
	// surprise at the first progress tick.
	zend_fcall_info fci = empty_fcall_info;
	zend_fcall_info_cache fcc = empty_fcall_info_cache;

	ZEND_PARSE_PARAMETERS_START(1, 2)
	Z_PARAM_ARRAY(request)
	Z_PARAM_OPTIONAL
	Z_PARAM_FUNC_OR_NULL(fci, fcc)
	ZEND_PARSE_PARAMETERS_END();

	bionic::Outcome outcome;
	zend_try
	{
		bionic::run_guarded(Z_ARRVAL_P(request), fci, fcc, outcome);
	}
	zend_catch
	{
		outcome.bailed = true;
	}
	zend_end_try();

	bionic::finish(outcome, return_value);
}

/**
 * Bionic\Solver\info(): reports the build metadata of the core.
 */
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

/**
 * Registers the exception and enum classes and their constants.
 */
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

/**
 * Prepares the per-request state of the module.
 */
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

// Hand-written primitives for the generated marshalling in src/php/gen. Nothing
// here is schema-specific, so this file stays fixed when the schema changes.

#pragma once

#include "types_domain_generated.h"

#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

extern "C" {
#include <php.h>
#include <zend_exceptions.h>
}

namespace bionic {
namespace php {

// Converted to a PHP ValueError at the module boundary.
struct ValueError {
	std::string message;
};

// Thrown when the onProgress callback raises; its exception is already pending.
struct ProgressAborted { };

[[noreturn]] inline void fail(std::string message)
{
	throw ValueError { std::move(message) };
}

inline std::string type_name(zval* value)
{
	return value ? zend_zval_type_name(value) : "nothing";
}

inline zval* find_key(HashTable* table, char const* key)
{
	return zend_hash_str_find(table, key, std::strlen(key));
}

inline bool absent(zval* value)
{
	return value == nullptr || Z_TYPE_P(value) == IS_NULL;
}

inline zval* required_key(HashTable* table, char const* key, std::string const& path)
{
	zval* value = find_key(table, key);
	if (absent(value))
		fail(path + "." + key + " is required");
	return value;
}

inline std::string required_string(zval*, std::string const&);
inline std::optional<std::string> optional_string(zval*, std::string const&);
inline int64_t required_int(zval*, std::string const&);
inline std::optional<int64_t> optional_int(zval*, std::string const&);
inline double required_double(zval*, std::string const&);
inline std::optional<double> optional_double(zval*, std::string const&);
inline bool required_bool(zval*, std::string const&);
inline std::optional<bool> optional_bool(zval*, std::string const&);
inline HashTable* optional_array(zval*, std::string const&);

inline std::string required_string(HashTable* table, char const* key, std::string const& path)
{
	zval* value = required_key(table, key, path);
	return required_string(value, path + "." + key);
}

inline std::string required_string(zval* value, std::string const& path)
{
	if (absent(value))
		fail(path + " is required");
	if (Z_TYPE_P(value) != IS_STRING)
		fail(path + " must be a string, " + type_name(value) + " given");
	return std::string(Z_STRVAL_P(value), Z_STRLEN_P(value));
}

inline std::optional<std::string> optional_string(HashTable* table, char const* key, std::string const& path)
{
	return optional_string(find_key(table, key), path + "." + key);
}

inline std::optional<std::string> optional_string(zval* value, std::string const& path)
{
	if (absent(value))
		return std::nullopt;
	return required_string(value, path);
}

inline int64_t required_int(HashTable* table, char const* key, std::string const& path)
{
	zval* value = required_key(table, key, path);
	return required_int(value, path + "." + key);
}

inline int64_t required_int(zval* value, std::string const& path)
{
	if (absent(value))
		fail(path + " is required");
	if (Z_TYPE_P(value) == IS_LONG)
		return Z_LVAL_P(value);
	// A float is accepted only when it is exactly integral, so that 1.5 is
	// rejected but 1200.0 is not.
	if (Z_TYPE_P(value) == IS_DOUBLE) {
		double const d = Z_DVAL_P(value);
		if (std::isfinite(d) && d >= -9.223372036854775808e18 && d < 9.223372036854775808e18) {
			int64_t const i = static_cast<int64_t>(d);
			if (d == static_cast<double>(i))
				return i;
		}
	}
	fail(path + " must be an integer, " + type_name(value) + " given");
}

inline std::optional<int64_t> optional_int(HashTable* table, char const* key, std::string const& path)
{
	return optional_int(find_key(table, key), path + "." + key);
}

inline std::optional<int64_t> optional_int(zval* value, std::string const& path)
{
	if (absent(value))
		return std::nullopt;
	return required_int(value, path);
}

inline double required_double(HashTable* table, char const* key, std::string const& path)
{
	zval* value = required_key(table, key, path);
	return required_double(value, path + "." + key);
}

inline double required_double(zval* value, std::string const& path)
{
	if (absent(value))
		fail(path + " is required");
	if (Z_TYPE_P(value) == IS_DOUBLE)
		return Z_DVAL_P(value);
	if (Z_TYPE_P(value) == IS_LONG)
		return static_cast<double>(Z_LVAL_P(value));
	fail(path + " must be a number, " + type_name(value) + " given");
}

inline std::optional<double> optional_double(HashTable* table, char const* key, std::string const& path)
{
	return optional_double(find_key(table, key), path + "." + key);
}

inline std::optional<double> optional_double(zval* value, std::string const& path)
{
	if (absent(value))
		return std::nullopt;
	return required_double(value, path);
}

inline bool required_bool(HashTable* table, char const* key, std::string const& path)
{
	zval* value = required_key(table, key, path);
	return required_bool(value, path + "." + key);
}

inline bool required_bool(zval* value, std::string const& path)
{
	if (absent(value))
		fail(path + " is required");
	if (Z_TYPE_P(value) == IS_TRUE)
		return true;
	if (Z_TYPE_P(value) == IS_FALSE)
		return false;
	fail(path + " must be a bool, " + type_name(value) + " given");
}

inline std::optional<bool> optional_bool(HashTable* table, char const* key, std::string const& path)
{
	return optional_bool(find_key(table, key), path + "." + key);
}

inline std::optional<bool> optional_bool(zval* value, std::string const& path)
{
	if (absent(value))
		return std::nullopt;
	return required_bool(value, path);
}

inline HashTable* required_array(HashTable* table, char const* key, std::string const& path)
{
	zval* value = required_key(table, key, path);
	if (Z_TYPE_P(value) != IS_ARRAY)
		fail(path + "." + key + " must be an array, " + type_name(value) + " given");
	return Z_ARRVAL_P(value);
}

inline HashTable* optional_array(HashTable* table, char const* key, std::string const& path)
{
	return optional_array(find_key(table, key), path + "." + key);
}

inline HashTable* optional_array(zval* value, std::string const& path)
{
	if (absent(value))
		return nullptr;
	if (Z_TYPE_P(value) != IS_ARRAY)
		fail(path + " must be an array, " + type_name(value) + " given");
	return Z_ARRVAL_P(value);
}

inline void put_string(zval* array, char const* key, std::string const& value)
{
	add_assoc_stringl(array, key, value.data(), value.size());
}

inline void put_int(zval* array, char const* key, int64_t value)
{
	add_assoc_long(array, key, static_cast<zend_long>(value));
}

inline void put_double(zval* array, char const* key, double value)
{
	add_assoc_double(array, key, value);
}

inline void put_bool(zval* array, char const* key, bool value)
{
	add_assoc_bool(array, key, value);
}

// 64-bit unsigned fields exceed the range of a PHP integer, so they are
// rejected rather than silently wrapped.
inline void put_uint64(zval* array, char const* key, uint64_t value)
{
	// Parenthesised because windows.h defines max() as a macro.
	if (value > static_cast<uint64_t>((std::numeric_limits<zend_long>::max)()))
		fail(std::string(key) + " exceeds the maximum integer this PHP build can represent");
	put_int(array, key, static_cast<int64_t>(value));
}

inline void put_optional_string(zval* array, char const* key, std::optional<std::string> const& value)
{
	if (value)
		put_string(array, key, *value);
}

inline void put_optional_int(zval* array, char const* key, std::optional<int64_t> const& value)
{
	if (value)
		put_int(array, key, *value);
}

inline void put_optional_double(zval* array, char const* key, std::optional<double> const& value)
{
	if (value)
		put_double(array, key, *value);
}

inline void put_optional_bool(zval* array, char const* key, std::optional<bool> const& value)
{
	if (value)
		put_bool(array, key, *value);
}

// Packed-list appends for vector<string> and vector-of-scalar fields. The
// element is stored by value, so the zval never outlives the call.
inline void append_string(zval* array, std::string const& value)
{
	zval item;
	ZVAL_STRINGL(&item, value.data(), value.size());
	zend_hash_next_index_insert(Z_ARRVAL_P(array), &item);
}

inline void append_int(zval* array, int64_t value)
{
	zval item;
	ZVAL_LONG(&item, static_cast<zend_long>(value));
	zend_hash_next_index_insert(Z_ARRVAL_P(array), &item);
}

// 64-bit unsigned elements exceed the range of a PHP integer, so they are
// rejected rather than silently wrapped.
inline void append_uint64(zval* array, uint64_t value)
{
	// Parenthesised because windows.h defines max() as a macro.
	if (value > static_cast<uint64_t>((std::numeric_limits<zend_long>::max)()))
		fail("an element exceeds the maximum integer this PHP build can represent");
	append_int(array, static_cast<int64_t>(value));
}

inline void append_double(zval* array, double value)
{
	zval item;
	ZVAL_DOUBLE(&item, value);
	zend_hash_next_index_insert(Z_ARRVAL_P(array), &item);
}

inline void append_bool(zval* array, bool value)
{
	zval item;
	ZVAL_BOOL(&item, value);
	zend_hash_next_index_insert(Z_ARRVAL_P(array), &item);
}

inline void attach(zval* array, char const* key, zval* nested)
{
	zend_hash_str_update(Z_ARRVAL_P(array), key, std::strlen(key), nested);
}

} // namespace php
} // namespace bionic

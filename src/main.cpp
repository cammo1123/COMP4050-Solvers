#include <cstddef>
#include <cstdio>
#include <iostream>
#include <optional>
#include <stdio.h>

#include "solve_domain_generated.h"
#include "solvers.h"

using namespace fbs::domain;

int main()
{
	std::cout << solvers::info() << '\n';

	SolveRequest solve = { };

	solve.boxes.push_back({
		.reference = "Small",
		.width = 10.0f,
		.length = 10.0f,
		.depth = 10.0f,

		.maximum_boxes = 2,
	});

	solve.boxes.push_back({
		.reference = "Medium",
		.width = 50.0f,
		.length = 50.0f,
		.depth = 50.0f,
	});

	solve.boxes.push_back({
		.reference = "Large",
		.width = 100.0f,
		.length = 100.0f,
		.depth = 100.0f,
	});

	for (auto i = 1; i <= 65; i++) {
		solve.items.push_back({
			.item_code = std::string("S") + std::to_string(i),
			.item_reference = std::string("Small") + std::to_string(i),
			.width = 1,
			.length = 1,
			.depth = 1,
			.weight = 1,
		});
	}

	for (auto i = 1; i <= 25; i++) {
		solve.items.push_back({
			.item_code = std::string("S") + std::to_string(i),
			.item_reference = std::string("Small") + std::to_string(i),
			.width = 10,
			.length = 10,
			.depth = 10,
			.weight = 10,
		});
	}

	for (auto i = 1; i <= 1000; i++) {
		solve.items.push_back({
			.item_code = std::string("L") + std::to_string(i),
			.item_reference = std::string("Large") + std::to_string(i),
			.width = 50,
			.length = 50,
			.depth = 50,
			.weight = 50,
		});
	}

	auto res = solvers::solve(solve, [](size_t done, size_t total) {
		std::cout << "\rprogress: " << ((static_cast<float>(done) / total) * 100) << "%" << std::flush;
	});
	std::cout << "\n";

	int i = 0;
	for (auto const& result : res.results) {
		i += result.placements.size();
	}

	std::cout << "Total: " << i << " items\n";

	return 0;
}

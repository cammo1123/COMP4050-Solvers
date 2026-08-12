#include <iostream>
#include <memory>

#include "solve_generated.h"
#include "solvers.h"

int main(int argc, char* argv[])
{
	std::cout << solvers::info() << '\n';

	solver::SolveRequestT solve;

	for (auto i = 0; i < 100; i++) {
		auto box = std::make_unique<solver::BoxTypeT>();
		box->reference = "HELLO";
		box->width = i * 10;
		box->length = i * 10;
		box->depth = i * 10;
		solve.boxes.push_back(std::move(box));
	}

	for (auto i = 0; i < 1000; i++) {
		auto item = std::make_unique<solver::ItemTypeT>();
		item->item_code = "HELLO";
		item->item_reference = "HELLO";
		item->width = i * 1;
		item->length = i * 1;
		item->depth = i * 1;
		solve.items.push_back(std::move(item));
	}

	auto res = solvers::solve(solve);
	std::cout << res.boxes.size() << '\n';
	std::cout << res.items.size() << '\n';

	return 0;
}

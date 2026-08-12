#include <iostream>

#include "solve_domain_generated.h"
#include "solvers.h"

using namespace fbs::domain;

int main(int argc, char* argv[])
{
	std::cout << solvers::info() << '\n';

	SolveRequest solve;

	for (auto i = 0; i < 100; i++) {
		BoxType box;
		box.reference = "HELLO";
		box.width = i * 10;
		box.length = i * 10;
		box.depth = i * 10;
		solve.boxes.push_back(std::move(box));
	}

	for (auto i = 0; i < 1000; i++) {
		ItemType item;
		item.item_code = "HELLO";
		item.item_reference = "HELLO";
		item.width = i;
		item.length = i;
		item.depth = i;
		solve.items.push_back(std::move(item));
	}

	auto res = solvers::solve(solve);
	std::cout << res.boxes.size() << '\n';
	std::cout << res.items.size() << '\n';

	return 0;
}

# Climbing Fall Simulation

This repository contains a webpage which can be used to simulate a climbing fall. Forces and rope stretching are simulated as accurately as possible and the simulation result is displayed using an animation as well as force, energy and position graphs.

The webpage is still work in progress. You can check out the current version at [https://m-ff-m.github.io/climbing-fall-simulation/](https://m-ff-m.github.io/climbing-fall-simulation/).

## License

Copyright © 2026 Fabian Michel

The entire code in this repository is licensed under the [MIT License](LICENSE.md).

## To-Do List

- improve force reporting for static slings: force transferral to bolt (0-mass end) when taut
- set sliding speed = 0 when rope end with significant mass hits deflection point
- properly implement damping for the rope to get rid of the too-springy behavior
- when using quickdraws with slings, add option to specify each sling length
- add possibility of a movable belayer attached to a fixed point
- improve slack handling (pre-simulation step with fixed climber and belayer)
- add some pre-calculated simulations
- add option to only save the simulation configuration (without the result)
- highlight key moments and calculate key forces (wall / ground impact, maximal force)
- decrease the axis legend text size if it covers too much of the available space
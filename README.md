# Climbing Fall Simulation

This repository contains a webpage which can be used to simulate a climbing fall. Forces and rope stretching are simulated as accurately as possible and the simulation result is displayed using an animation as well as force, energy and position graphs.

## License

Copyright © 2025 Fabian Michel

The entire code in this repository is licensed under the [MIT License](LICENSE.md).

## To-Do List

- make the resizer work (which changes the size of the left and right panels); also consider if the canvas scaling settings should change when resizing
- change the layout when the available width is smaller than the available height
- add playback controls: pause, animation speed, step functions
- add a mask for the simulation set-up
- add legends for the different types of force and energy graphs per object
- add a view showing the simulation when looking along the x-axis
- decrease the axis legend text size if it covers too much of the available space
- make zooming and panning work on touch devices
- add the option to store simulation results in-browser and to download and upload them
- add proper quickdraws where the carabiner is attached to a fixed point via a sling
- properly implement damping for the rope to get rid of the too-springy behavior
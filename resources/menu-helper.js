
/**
 * Initialize the menu functions
 * @param {FallSimulationLayout} layoutManager the layout manager
 */
function initializeMenu(layoutManager) {
  document.getElementById('change-views').addEventListener('click', () => {

    layoutManager.simulationMenu.style.display = 'none';
    const confirmSelection = document.createElement('button');
    confirmSelection.textContent = 'Confirm view selection';
    layoutManager.rightSubpanels[0].replaceChildren(confirmSelection);

    for (let i = 0; i < layoutManager.graphCanvases.length; i++) {
      const select = document.createElement('select');
      for (const graphView of Object.keys(GRAPH_PROPERTIES)) {
        const legend = GRAPH_PROPERTIES[graphView]['legend'].replace(/:$/, '');
        const option = document.createElement('option');
        option.textContent = legend;
        option.value = graphView;
        if (layoutManager.graphCanvases[i].graphType === graphView)
          option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener('change', ((idx, select, layoutManager) => {
        return () => {
          if (select.value !== layoutManager.graphCanvases[idx].graphType) {
            layoutManager.graphCanvases[idx].destroy();
            layoutManager.graphCanvases[idx] = new GraphCanvas(
              layoutManager.rightSubpanels[idx + 1],
              layoutManager.snapshots,
              select.value
            );
            layoutManager.graphCanvases[idx].currentTime = layoutManager.lastFrameSimTime;
            layoutManager.graphCanvases[idx].draw();
            layoutManager.graphCanvases[idx].can.showOverlay(select);
          }
        };
      })(i, select, layoutManager));
      layoutManager.graphCanvases[i].can.showOverlay(select);
    }

    for (let i = 0; i < layoutManager.graphicsManagers.length; i++) {
      const select = document.createElement('select');
      for (const [legend, val] of [['side view', 'true'], ['frontal view', 'false']]) {
        const option = document.createElement('option');
        option.textContent = legend;
        option.value = val;
        if (layoutManager.graphicsManagers[i].xyProjectionMode === (val === 'true'))
          option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener('change', ((idx, select, layoutManager) => {
        return () => {
          if ((select.value === 'true') !== layoutManager.graphicsManagers[idx].xyProjectionMode) {
            layoutManager.graphicsManagers[idx].destroy();
            layoutManager.graphicsManagers[idx] = new WorldGraphics(
              layoutManager.bodyPanels[idx],
              (select.value === 'true')
            );
            layoutManager.drawSnapshotAtIndex(layoutManager.lastFrameDrawn);
            layoutManager.graphicsManagers[idx].can.showOverlay(select);
          }
        };
      })(i, select, layoutManager));
      layoutManager.graphicsManagers[i].can.showOverlay(select);
    }

    confirmSelection.addEventListener('click', () => {
      for (let i = 0; i < layoutManager.graphCanvases.length; i++) {
        layoutManager.graphCanvases[i].can.hideOverlay();
      }
      for (let i = 0; i < layoutManager.graphicsManagers.length; i++) {
        layoutManager.graphicsManagers[i].can.hideOverlay();
      }
      layoutManager.rightSubpanels[0].replaceChildren(layoutManager.playbackControls);
    });
  });
}

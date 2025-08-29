
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

  if (layoutManager.simResAutoSaved)
    document.getElementById('saved-automatically').textContent = 'This simulation has been saved automatically. However, note that only three automatically saved simulation results are stored at any time.';
  else {
    if (layoutManager.simResUserSaved === null || typeof layoutManager.simResUserSaved === 'undefined')
      document.getElementById('saved-automatically').textContent = 'This simulation has not been saved automatically (either due to the large amount of generated data, or because you loaded if from disk). You can save it manually.';
    else
      document.getElementById('saved-automatically').textContent = 'This simulation has not been saved automatically, but it has already been saved manually.';
  }

  document.getElementById('save-on-disk').addEventListener('click', () => {
    SimulationStorageManager.saveResultAsFile(layoutManager.setupMaskSettings, layoutManager.snapshots);
  });

  if (layoutManager.simResUserSaved === null || typeof layoutManager.simResUserSaved === 'undefined')
    document.getElementById('save-in-browser-hint').textContent = 'This simulation has not yet been saved manually in the browser.';
  else
    document.getElementById('save-in-browser-hint').textContent = `This simulation has been saved in the browser under the name ${layoutManager.simResUserSaved}.`;

  document.getElementById('save-in-browser').addEventListener('click', () => {
    if (document.getElementById('save-in-browser-name').value !== '') {
      if (SimulationStorageManager.saveResultInBrowser(document.getElementById('save-in-browser-name').value, layoutManager.setupMaskSettings, layoutManager.snapshots))
        document.getElementById('save-in-browser-hint').textContent = `This simulation has been saved in the browser under the name ${document.getElementById('save-in-browser-name').value}.`;
      else
        document.getElementById('save-in-browser-hint').textContent = 'Saving failed. This is probably due to the storage limit (set by the browser) being exceeded. Try saving the result on your disk instead.';
    } else {
      alert('Please enter a name for saving (so that you can later identify the simulation again).');
    }
  });

  document.getElementById('menu-version').textContent = `v${GLOBALS.version} from ${GLOBALS.versionDate}`;
}

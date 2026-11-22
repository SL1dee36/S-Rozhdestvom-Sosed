import * as THREE from 'three';
import { Engine, GameObject, BoxCollider, RigidBody } from './lumina/index.js?v=3';
import { KhrushchevkaBuilder } from './src/world/KhrushchevkaBuilder.js?v=3';
import { PlayerController } from './src/game/PlayerController.js?v=3';
import { MonsterAI } from './src/game/MonsterAI.js?v=3';
import { UIManager } from './src/game/UIManager.js?v=3';
import { StoryDirector } from './src/game/StoryDirector.js?v=3';

const engine = new Engine('gameCanvas');

const world = new KhrushchevkaBuilder(engine).build();
world.crtTV.update(0.1);

const playerGO = new GameObject('Player');
playerGO.transform.position.copy(world.playerSpawn.position);
playerGO.addComponent(BoxCollider, new THREE.Vector3(0.46, 1.70, 0.46), new THREE.Vector3(0, 0.85, 0));
playerGO.addComponent(RigidBody, { bodyType: 'dynamic', useGravity: true, friction: 0.0 });
const playerCtrl = playerGO.addComponent(PlayerController, world);
engine.addGameObject(playerGO);
engine.setPlayer(playerGO);

const monsterGO = new GameObject('Monster');
const monsterAI = monsterGO.addComponent(MonsterAI, world, playerCtrl);
engine.addGameObject(monsterGO);

// Precompile all shaders across the scene (including balcony & courtyard) to prevent first-time frame drops
engine.renderer.precompileScene();

const ui = new UIManager(engine);
const director = new StoryDirector(engine, world, playerCtrl, monsterAI, ui);

ui.callbacks.onNewGame = () => {
    director.startNewGame();
};
ui.callbacks.onLoadCheckpoint = () => {
    director.loadCheckpoint2345();
};
ui.callbacks.onResume = () => {
    ui.showGameplayHUD(director.phase === 'act1_wake_sitting' || director.phase === 'act1_standing_up');
};
ui.callbacks.onQuitToMenu = () => {
    director.stopAllAudioLoops();
};
ui.callbacks.onEnterMainMenu = () => {
    director.setupMainMenuScene();
};
ui.callbacks.onEnsureMenuMusic = () => {
    director.ensureMenuMusic();
};
ui.callbacks.onSensitivityChange = (mult) => {
    playerCtrl.setSensitivityMultiplier(mult);
};
ui.callbacks.onCameraTiltChange = (enabled) => {
    playerCtrl.setCameraTiltEnabled(enabled);
};
playerCtrl.setSensitivityMultiplier(ui.getSensitivityMultiplier());
playerCtrl.setCameraTiltEnabled(ui.isCameraTiltEnabled());

engine.inputManager.onPauseToggle = (paused) => {
    if (paused && director.phase !== 'menu' && director.phase !== 'ended') {
        ui.showPauseMenu();
    }
};

engine.addUpdateCallback((deltaTime) => {
    director.update(deltaTime);
});

ui.applyVHSIntensity(0.5);
ui.showMainMenu();
engine.start();

import * as THREE from 'three';
import { Interactable } from '../../lumina/index.js';
import { t as tr, onLanguageChange } from '../i18n/Localization.js';

export class StoryDirector {
    constructor(engine, world, player, monster, ui) {
        this.engine = engine;
        this.world = world;
        this.player = player;
        this.monster = monster;
        this.ui = ui;

        this.act = 0;
        this.phase = 'menu';
        this.phaseTimer = 0;
        this.clockMinutes = 0;
        this.hasCheckpoint = localStorage.getItem('sng_checkpoint_2345') === '1';
        this.ui.setCheckpointAvailable(this.hasCheckpoint);
        onLanguageChange(() => {
            if (this.act === 0 && this.phase === 'prologue') {
                this._refreshObjectives();
            } else if (this.act === 1 && this.phase === 'act1') {
                this._refreshObjectives();
            } else if (this.act === 4) {
                this._refreshAct4Objectives();
            }
        });

        this._noiseSustain = 0;
        this._assaultStep = 0;
        this._fireworkTimer = 0;
        this._fadeVal = 1.0;
        this._twistStep = 0;
        this._twistLookTarget = new THREE.Vector3();
        this._twistPlayerStartPos = new THREE.Vector3();
        this._midnightStartPos = new THREE.Vector3();
        this._midnightWalkStepTimer = 0;
        this._act4LookTarget = new THREE.Vector3();

        this.act1Tasks = {};
        this.prologueTasks = {};
        this.act4Inspected = {};
        this._tableStage = 'on_balcony'; // 'on_balcony' | 'carrying' | 'placed_folded' | 'wing1_open' | 'unfolded'
        this._tableDinnerStep = 0;
        this._tableDinnerTimer = 0;
        this._washFinishTime = 0;
        this._horrorEventsTriggered = new Set();
        this._menuMusicStarted = false;

        this._inStore = false;
        this._activeNpcId = null;
        this._storeTransition = null;
        this._cookingInProgress = false;
        this._ovenBaking = false;
        this._ovenBakeTimer = 0;
        this._ovenBakeDuration = 45.0;
        this._talkedNPCs = new Set();
        this._askedDialogTopics = new Set();
        this._droppedItems = new Set();
        this._flyingProps = [];
        this._smokePromptState = '';
        this._peeState = null;
        this._peeDecals = [];
        this._peeTexture = null;
        this._peeWaterTexture = null;
        this._peepholeStalkerSeen = false;
        this._peepholeScratchDone = false;
        this._act3DistractionDone = false;
        this._act3KettleDone = false;
        this._lowOxygenWhisperTimer = 0;
        this._balconyWatcherTimer = 0;

        this._initAudioManifest();
        this._bindInteractables();
        this._bindMonsterCallbacks();
        this._setupMenuAudioUnlock();
    }

    _initAudioManifest() {
        this.engine.audioSystem.loadAudioAssets({
            ogonyok_waltz: './assets/audio/ogonyok_waltz.ogg',
            clock_tick: './assets/audio/clock_tick.ogg',
            doorbell: './assets/audio/doorbell.ogg',
            glass_break: './assets/audio/glass_break.ogg',
            heartbeat: './assets/audio/heartbeat.ogg',
            horror_darkness: './assets/audio/horror_darkness.mp3',
            melancholy_ambient: './assets/audio/melancholy_ambient.ogg',
            chimes: './assets/audio/chimes.ogg',
            fireworks: './assets/audio/fireworks.ogg',
            door_knock: './assets/audio/door_knock.ogg',
            door_bang: './assets/audio/door_bang.mp3',
            tv_emergency_voice: './assets/audio/tv_emergency_voice.wav'
        }).then(() => {
            if (this.phase === 'menu') {
                this.ensureMenuMusic();
            }
        });
    }

    _setupMenuAudioUnlock() {
        const unlock = () => {
            if (this.phase === 'menu') {
                this.ensureMenuMusic();
            }
        };
        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('keydown', unlock, { passive: true });
    }

    ensureMenuMusic() {
        if (this.phase !== 'menu') return;
        const a = this.engine.audioSystem;
        a.initContext();
        if (a.ctx && a.ctx.state === 'running' && a.buffers.has('ogonyok_waltz')) {
            if (!a.activeLoops.has('menu_music')) {
                a.startSpatialLoop('menu_music', 'ogonyok_waltz', new THREE.Vector3(0.45, 1.5, -3.85), {
                    volume: 0.35,
                    tvFilter: false,
                    checkOcclusion: false,
                    refDistance: 50,
                    maxDistance: 200,
                    rolloffFactor: 0
                });
            }
            this._menuMusicStarted = true;
        }
    }

    _bindMonsterCallbacks() {
        this.monster.setCallbacks({
            onJumpscare: (reason) => {
                this.phase = 'jumpscare_delay';
                this.phaseTimer = 0;
                this._jumpscareReason = reason;
                this.player.controlsLocked = true;
                this.player.allowLookWhileLocked = false;
                if (this.player.isHidden) this.player.exitHidingSpot();
            },
            onTrapLeft: () => {
                this._transitionToAct4();
            },
            onHorrorCue: (type) => {
                if (type === 'inspect_hiding') {
                    this.ui.showSubtitle(tr('sub.act3_hiding_inspect'), 3400);
                } else if (type === 'investigate') {
                    this.ui.showSubtitle(tr('sub.act3_heard_something'), 2800);
                }
            }
        });
    }

    _bindInteractables() {
        const w = this.world;

        w.frontDoor.go.addComponent(Interactable, {
            maxDistance: 1.75,
            promptText: () => {
                if (this.act === 0 && this.phase === 'prologue' && !this.prologueTasks.shopDone && !this._inStore) {
                    return tr('prompt.go_to_store');
                }
                if (this.act === 1) return tr('prompt.peephole');
                if (this.act === 4 && !this.act4Inspected.door) return tr('prompt.inspect_door');
                return '';
            },
            canInteract: () => (
                (this.act === 0 && this.phase === 'prologue' && !this.prologueTasks.shopDone && !this._inStore && !this._storeTransition && !this.player.heldItem) ||
                (this.act === 1 && this.phase === 'act1' && !this.player.isPeephole && !this.player._peepholeAnim) ||
                (this.act === 4 && !this.act4Inspected.door)
            ),
            onInteract: () => {
                if (this.act === 0 && this.phase === 'prologue' && !this.prologueTasks.shopDone && !this._inStore) {
                    this._enterGroceryStore();
                } else if (this.act === 1) {
                    this._stopDoorKnockAndPlayStairRun();
                    this.player.enterPeephole();
                    if (!this.act1Tasks.peephole) {
                        this.act1Tasks.peephole = true;
                        this.ui.showSubtitle(tr('sub.peephole_empty'), 4400);
                        this._refreshObjectives();
                    } else if (!this._peepholeStalkerSeen) {
                        // Second time checking peephole in Act I: eerie figure lurking in the stairwell corner!
                        this._peepholeStalkerSeen = true;
                        this.monster.showPhantomAt(new THREE.Vector3(3.15, 0, 5.55), new THREE.Vector3(3.075, 1.4, 4.5), true);
                        this.engine.renderer.triggerGlitch(0.45);
                        this.engine.audioSystem.playSpatialOneShot('whisper_cue', new THREE.Vector3(3.08, 1.4, 4.8), { volume: 0.55 });
                        this.ui.showSubtitle(tr('sub.peephole_stalker'), 4200);
                        setTimeout(() => {
                            if (this.act === 1) this.monster.hidePhantom();
                        }, 2800);
                    } else if (!this._peepholeScratchDone) {
                        this._peepholeScratchDone = true;
                        this.monster.hidePhantom();
                        if (w.frontDoor?.clawDecal) w.frontDoor.clawDecal.visible = true;
                        this.engine.audioSystem.playSpatialOneShot('knife_drag', new THREE.Vector3(3.08, 1.3, 4.6), { volume: 0.7 });
                        this.ui.showSubtitle(tr('sub.peephole_gone_scratch'), 4000);
                    } else {
                        this.ui.showSubtitle(tr('sub.peephole_empty'), 3200);
                    }
                } else if (this.act === 4) {
                    this._inspectPoint('door', tr('sub.act4_inspect_door'));
                }
            }
        });

        w.bathroomSink.addComponent(Interactable, {
            maxDistance: 1.85,
            promptText: () => {
                if (this.act === 1 && !this.act1Tasks.wash) return tr('prompt.wash_face');
                if (this.act === 1 && this.act1Tasks.usedToilet && !this.act1Tasks.washedHandsAfterToilet) {
                    return tr('prompt.wash_hands');
                }
                return '';
            },
            canInteract: () => (
                (this.act === 1 && !this.act1Tasks.wash && !this._washingInProgress && this.phase === 'act1') ||
                (this.act === 1 && this.act1Tasks.usedToilet && !this.act1Tasks.washedHandsAfterToilet && !this._washingInProgress && this.phase === 'act1')
            ),
            onInteract: () => {
                if (!this.act1Tasks.wash) {
                    this._washingInProgress = true;
                    w.bathroomFaucet?.setOn(true);
                    this.engine.audioSystem.playSpatialOneShot('steam_hiss', w.bathroomSink.transform.position, { volume: 0.5 });
                    this.player.startWashFaceAnimation(
                        () => {
                            this._washingInProgress = false;
                            w.bathroomFaucet?.setOn(false);
                            this.monster.hidePhantom();
                            this.act1Tasks.wash = true;
                            this._washFinishTime = this.phaseTimer;
                            this.ui.showSubtitle(tr('sub.wash_done'), 3200);
                            this._refreshObjectives();
                        },
                        () => {
                            // Brief 0.45s phantom silhouette in the bathroom mirror doorway right as the player opens their eyes!
                            this.monster.showPhantomAt(new THREE.Vector3(3.92, 0, 2.45), new THREE.Vector3(4.75, 1.4, 1.92), true);
                            if (w.lights.bathroomLight) w.lights.bathroomLight.intensity = 0.35;
                            this.engine.renderer.triggerGlitch(0.32);
                            setTimeout(() => {
                                this.monster.hidePhantom();
                                if (this.act === 1 && w.roomLights.bathroom?.isOn() && w.lights.bathroomLight) {
                                    w.lights.bathroomLight.intensity = 1.7;
                                }
                            }, 420);
                        }
                    );
                } else if (this.act1Tasks.usedToilet && !this.act1Tasks.washedHandsAfterToilet) {
                    // Secret unmarked task: washing hands after using the toilet!
                    this._washingInProgress = true;
                    w.bathroomFaucet?.setOn(true);
                    this.engine.audioSystem.playSpatialOneShot('steam_hiss', w.bathroomSink.transform.position, { volume: 0.5 });
                    setTimeout(() => {
                        this._washingInProgress = false;
                        w.bathroomFaucet?.setOn(false);
                        this.act1Tasks.washedHandsAfterToilet = true;
                        this.ui.showSubtitle(tr('sub.wash_hands_secret_done'), 4200);
                    }, 1800);
                }
            }
        });

        if (w.toilet) {
            w.toilet.addComponent(Interactable, {
                maxDistance: 1.85,
                promptText: () => {
                    if (this.act === 1 && this.act1Tasks.watchTv && this.act1Tasks.pourDrink && !this.act1Tasks.usedToilet) {
                        return tr('prompt.use_toilet');
                    }
                    return tr('prompt.flush_toilet');
                },
                canInteract: () => (this.act === 1 || this.act === 2) && this.phase === 'act1',
                onInteract: () => {
                    if (this.act === 1 && this.act1Tasks.watchTv && this.act1Tasks.pourDrink && !this.act1Tasks.usedToilet) {
                        this._startToiletPeeSequence();
                        return;
                    }
                    this.engine.audioSystem.playSpatialOneShot('steam_hiss', w.toilet.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle(tr('sub.toilet_flush'), 2600);
                }
            });
        }

        if (w.interiorDoors) {
            for (const door of w.interiorDoors) {
                door.pivot.addComponent(Interactable, {
                    maxDistance: 1.75,
                    promptText: () => (door.isOpen()
                        ? tr('prompt.door_close', { label: tr(door.label) })
                        : tr('prompt.door_open', { label: tr(door.label) })),
                    canInteract: () => !this.player.isHidden && !this.player.isPeephole,
                    onInteract: () => door.toggle()
                });
            }
        }

        const treeTargets = [];
        w.treeGO.transform.traverse(c => { if (c.isMesh) treeTargets.push(c); });
        w.fallenSantaHat.traverse(c => { if (c.isMesh) treeTargets.push(c); });
        w.treeGO.addComponent(Interactable, {
            maxDistance: 1.85,
            targetMeshes: treeTargets,
            promptText: () => {
                if (this.act === 1 && !this.act1Tasks.garland) {
                    return this.act1Tasks.decorBox
                        ? tr('prompt.tree_decorate')
                        : tr('prompt.tree_need_box');
                }
                if (this.act === 4 && !this.act4Inspected.tree) return tr('prompt.inspect_tree');
                return '';
            },
            canInteract: () => (
                (this.act === 1 && this.act1Tasks.stool && this.act1Tasks.decorBox && !this.act1Tasks.garland && !this._treeDecoratingInProgress) ||
                (this.act === 4 && !this.act4Inspected.tree)
            ),
            onInteract: () => {
                if (this.act === 1) {
                    if (!this.act1Tasks.decorBox) {
                        this.ui.showSubtitle(tr('sub.tree_need_box'), 3400);
                        return;
                    }
                    this._treeDecoratingInProgress = true;
                    if (w.treeDecorHighlight) w.treeDecorHighlight.visible = false;
                    this.ui.showSubtitle(tr('sub.tree_decorating'), 3200);
                    this.player.startDecorateTreeAnimation(
                        (ratio) => {
                            w.setTreeDecorProgress?.(ratio);
                        },
                        () => {
                            this._treeDecoratingInProgress = false;
                            this.act1Tasks.garland = true;
                            w.setTreeDecorProgress?.(1.0);
                            w.garlandOn = true;
                            this.engine.audioSystem.playSpatialOneShot('pickup', w.treeGO.transform.position);
                            const t = this.act1Tasks;
                            this._syncDecorBoxVisuals();
                            if (t.decorHall && t.decorKitchen && t.decorHallway && t.garland) {
                                t.decorate = true;
                                this.ui.showSubtitle(tr('sub.decor_box_empty_return'), 4200);
                            } else {
                                this.ui.showSubtitle(tr('sub.tree_done'), 3400);
                            }
                            this._refreshObjectives();
                            this._checkAct1IndoorCompletion();
                        }
                    );
                } else if (this.act === 4) {
                    this._inspectPoint('tree', tr('sub.act4_inspect_tree'));
                }
            }
        });

        // Table placement zone in Hall
        if (w.tablePlacementZone?.go) {
            w.tablePlacementZone.go.addComponent(Interactable, {
                maxDistance: 1.85,
                promptText: () => tr('prompt.table_place'),
                canInteract: () => this.act === 1 && this._tableStage === 'carrying' && this.player.heldItem === 'table',
                onInteract: () => {
                    this.player.setHeldItem(null);
                    w.tablePlacementZone.go.transform.visible = false;
                    w.table.placeInHallFolded();
                    this._tableStage = 'placed_folded';
                    this.act1Tasks.tablePlaced = true;
                    this.engine.audioSystem.playSpatialOneShot('footstep_parquet', w.table.hallPos, { heavy: true, volume: 0.75 });
                    this.ui.showSubtitle(tr('sub.table_placed'), 3800);
                    this._refreshObjectives();
                }
            });
        }

        // Stool pickup in Kitchen & placement zone in Hall (only after table + tablecloth are done)
        if (w.kitchenStool) {
            w.kitchenStool.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => tr('prompt.stool_pickup'),
                canInteract: () => (this._droppedItems.has('stool') || (this.act === 1 && this.act1Tasks.table)) && !this.act1Tasks.stoolPicked && !this.player.heldItem,
                onInteract: () => {
                    this._droppedItems.delete('stool');
                    this._removeFlyingProp(w.kitchenStool);
                    w.kitchenStool.transform.rotation.set(0, 0, 0);
                    w.kitchenStool.transform.visible = false;
                    this.act1Tasks.stoolPicked = true;
                    this.player.setHeldItem('stool');
                    if (w.stoolPlacementZone) w.stoolPlacementZone.transform.visible = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.kitchenStool.transform.position);
                    this.ui.showSubtitle(tr('sub.stool_pickup'), 3000);
                    this._refreshObjectives();
                }
            });
        }

        if (w.stoolPlacementZone) {
            w.stoolPlacementZone.addComponent(Interactable, {
                maxDistance: 1.8,
                promptText: () => tr('prompt.stool_place'),
                canInteract: () => this.act === 1 && this.player.heldItem === 'stool',
                onInteract: () => {
                    this.player.setHeldItem(null);
                    w.stoolPlacementZone.transform.visible = false;
                    if (w.placedHallStool) w.placedHallStool.transform.visible = true;
                    this.act1Tasks.stool = true;
                    this.engine.audioSystem.playSpatialOneShot('footstep_parquet', w.stoolPlacementZone.transform.position, { volume: 0.55 });
                    this.ui.showSubtitle(tr('sub.stool_placed'), 3500);
                    this._refreshObjectives();
                    this._checkAct1IndoorCompletion();
                }
            });
        }

        if (w.placedHallStool) {
            w.placedHallStool.addComponent(Interactable, {
                maxDistance: 1.75,
                promptText: () => tr('prompt.table_sit'),
                canInteract: () => (
                    this.act === 1 &&
                    this.phase === 'act1' &&
                    this._isIndoorChoresDone() &&
                    this.act1Tasks.champagne &&
                    !this.act1Tasks.pourDrink &&
                    !this.player.heldItem
                ),
                onInteract: () => {
                    this._enterTableDinnerScene();
                }
            });
        }

        // Festive Tablecloth pickup inside the Hallway Wardrobe
        if (w.wardrobeTablecloth) {
            const wardSpot = w.hidingSpots.find(s => s.id === 'wardrobe');
            w.wardrobeTablecloth.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => (
                    this.player.heldItem
                        ? tr('prompt.tablecloth_hands_full')
                        : tr('prompt.tablecloth_pickup')
                ),
                canInteract: () => (
                    (this._droppedItems.has('tablecloth') || (this.act === 1 && this._tableStage === 'unfolded_bare' && (!wardSpot || !wardSpot.isDoorClosed()))) &&
                    !this.act1Tasks.tableclothPicked
                ),
                onInteract: () => {
                    if (!this.act1Tasks.peephole) {
                        this.ui.showSubtitle(tr('sub.tablecloth_early'), 2800);
                        return;
                    }
                    if (this.player.heldItem) {
                        this.ui.showSubtitle(tr('sub.tablecloth_hands_full'), 3000);
                        return;
                    }
                    this._droppedItems.delete('tablecloth');
                    this._removeFlyingProp(w.wardrobeTablecloth);
                    w.wardrobeTablecloth.transform.rotation.set(0, 0, 0);
                    w.wardrobeTablecloth.transform.visible = false;
                    this.act1Tasks.tableclothPicked = true;
                    this.player.setHeldItem('tablecloth');
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.wardrobeTablecloth.transform.position);
                    this.ui.showSubtitle(tr('sub.tablecloth_pickup'), 3600);
                    this._refreshObjectives();
                }
            });
        }

        // Folding Table interactions: pickup on balcony -> unfold half 1 (4s) -> unfold half 2 (4s) -> spread tablecloth from wardrobe -> place food -> sit at table
        w.table.go.addComponent(Interactable, {
            maxDistance: 1.85,
            promptText: () => {
                if (this._tableStage === 'on_balcony') {
                    return tr('prompt.table_pickup');
                }
                if (this._tableStage === 'placed_folded') {
                    return tr('prompt.table_unfold_1');
                }
                if (this._tableStage === 'wing1_open') {
                    return tr('prompt.table_unfold_2');
                }
                if (this._tableStage === 'unfolded_bare') {
                    return this.act1Tasks.tableclothPicked
                        ? tr('prompt.table_spread_cloth')
                        : tr('prompt.table_need_cloth');
                }
                if (this._tableStage === 'unfolded') {
                    if (this.player.heldItem && this._isFoodOrTableItem(this.player.heldItem)) {
                        return tr('prompt.table_put_item', { item: this._itemName(this.player.heldItem) });
                    }
                    if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink && !this.player.heldItem) {
                        return tr('prompt.table_sit');
                    }
                }
                return '';
            },
            holdDuration: () => {
                if (this._tableStage === 'placed_folded' || this._tableStage === 'wing1_open') {
                    return 4.0;
                }
                if (this._tableStage === 'unfolded_bare' && this.act1Tasks.tableclothPicked) {
                    return 1.8;
                }
                return 0;
            },
            canInteract: () => {
                if (this.act !== 1 || this.phase !== 'act1') return false;
                if (this._tableStage === 'on_balcony') {
                    return this.act1Tasks.peephole && (!this.player.heldItem || this.player.heldItem === 'tablecloth');
                }
                if (this._tableStage === 'placed_folded' || this._tableStage === 'wing1_open') {
                    return !this.player.heldItem || this.player.heldItem === 'tablecloth';
                }
                if (this._tableStage === 'unfolded_bare') {
                    return true;
                }
                if (this._tableStage === 'unfolded') {
                    if (this.player.heldItem && this._isFoodOrTableItem(this.player.heldItem)) return true;
                    if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink && !this.player.heldItem) return true;
                }
                return false;
            },
            onInteract: () => {
                if (this._tableStage === 'on_balcony') {
                    w.table.go.transform.visible = false;
                    w.table.collider.enabled = false;
                    this.player.setHeldItem('table');
                    this._tableStage = 'carrying';
                    this.act1Tasks.tablePicked = true;
                    if (w.tablePlacementZone?.go) w.tablePlacementZone.go.transform.visible = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.table.balconyPos, { volume: 0.6 });
                    this.ui.showSubtitle(tr('sub.table_pickup'), 3800);
                    this._refreshObjectives();
                    return;
                }
                if (this._tableStage === 'placed_folded') {
                    w.table.setWingProgress(1, 1.0);
                    this._tableStage = 'wing1_open';
                    this.engine.audioSystem.playSpatialOneShot('door_open', w.table.go.transform.position);
                    this.ui.showSubtitle(tr('sub.table_wing1'), 3000);
                    this._refreshObjectives();
                    return;
                }
                if (this._tableStage === 'wing1_open') {
                    w.table.setWingProgress(2, 1.0);
                    this._tableStage = 'unfolded_bare';
                    this.act1Tasks.tableWings = true;
                    if (!this.act1Tasks.stool && w.stoolPlacementZone) {
                        w.stoolPlacementZone.transform.visible = true;
                    }
                    if (this.act1Tasks.tableclothPicked && !this.player.heldItem) {
                        this.player.setHeldItem('tablecloth');
                    }
                    this.engine.audioSystem.playSpatialOneShot('door_open', w.table.go.transform.position);
                    if (this.act1Tasks.tableclothPicked) {
                        this.ui.showSubtitle(tr('sub.table_unfolded_with_cloth'), 3500);
                    } else {
                        this.ui.showSubtitle(tr('sub.table_unfolded_no_cloth'), 4000);
                    }
                    this._refreshObjectives();
                    return;
                }
                if (this._tableStage === 'unfolded_bare') {
                    if (!this.act1Tasks.tableclothPicked) {
                        this.ui.showSubtitle(tr('sub.table_need_cloth'), 3400);
                        return;
                    }
                    w.table.setTableclothProgress(1.0);
                    this._tableStage = 'unfolded';
                    this.act1Tasks.table = true;
                    if (this.player.heldItem === 'tablecloth') {
                        this.player.setHeldItem(null);
                    }
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.table.go.transform.position, { volume: 0.55 });
                    this.ui.showSubtitle(tr('sub.table_cloth_done'), 3800);
                    this._refreshObjectives();
                    this._checkAct1IndoorCompletion();
                    return;
                }
                if (this._tableStage === 'unfolded') {
                    if (this.player.heldItem && this._isFoodOrTableItem(this.player.heldItem)) {
                        const item = this.player.heldItem;
                        const propObj = w.itemsOnTable[item];
                        if (propObj) {
                            // Free placement: place dish exactly where player is aiming on the tabletop!
                            const hit = this.engine.interactionSystem.currentHitPoint;
                            if (hit) {
                                const localPt = w.table.go.transform.worldToLocal(hit.clone());
                                propObj.position.x = THREE.MathUtils.clamp(localPt.x, -0.58, 0.58);
                                propObj.position.z = THREE.MathUtils.clamp(localPt.z, -0.28, 0.28);
                            }
                            propObj.visible = true;
                        }
                        if (w.tablePlaceMarker) w.tablePlaceMarker.visible = false;
                        this._droppedItems.delete(item);
                        this.act1Tasks[item] = true;
                        this.player.setHeldItem(null);
                        this.engine.audioSystem.playSpatialOneShot('pickup', w.table.go.transform.position);
                        this._refreshObjectives();
                        this._checkAct1IndoorCompletion();
                    } else if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink) {
                        this._enterTableDinnerScene();
                    }
                }
            }
        });

        w.table.wreckedGO.addComponent(Interactable, {
            maxDistance: 1.8,
            promptText: () => tr('prompt.inspect_table'),
            canInteract: () => this.act === 4 && !this.act4Inspected.table,
            onInteract: () => {
                this._inspectPoint('table', tr('sub.act4_inspect_table'));
            }
        });

        w.sideboardCrystal.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.crystal_pickup'),
            canInteract: () => (this._droppedItems.has('crystal') || (this.act === 1 && this.act1Tasks.decorBoxReturned)) && !this.act1Tasks.crystal && !this.player.heldItem,
            onInteract: () => {
                this._pickupWorldItem('crystal', w.sideboardCrystal);
            }
        });

        w.pantryPickles.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.pickles_pickup'),
            canInteract: () => (this._droppedItems.has('pickles') || (this.act === 1 && this.act1Tasks.crystal)) && !this.act1Tasks.pickles && !this.player.heldItem,
            onInteract: () => {
                this._pickupWorldItem('pickles', w.pantryPickles);
            }
        });

        w.fridgeOlivier.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.olivier_pickup'),
            canInteract: () => (this._droppedItems.has('olivier') || (this.act === 1 && this.act1Tasks.pickles && w.fridge.isOpen())) && w.fridgeOlivier.transform.visible && !this.act1Tasks.olivier && !this.player.heldItem,
            onInteract: () => {
                this._pickupWorldItem('olivier', w.fridgeOlivier);
            }
        });

        w.fridgeMeat.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.meat_pickup'),
            canInteract: () => (this._droppedItems.has('meat') || (this.act === 1 && this.act1Tasks.pickles && w.fridge.isOpen())) && w.fridgeMeat.transform.visible && !this.act1Tasks.meat && !this.player.heldItem,
            onInteract: () => {
                this._pickupWorldItem('meat', w.fridgeMeat);
            }
        });

        w.ovenChicken.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.chicken_pickup'),
            canInteract: () => (
                (this._droppedItems.has('chicken') || (this.act === 1 && this.act1Tasks.olivier && this.act1Tasks.meat && w.stove.isOpen())) &&
                w.ovenChicken.transform.visible &&
                !this.act1Tasks.chicken &&
                !this.player.heldItem
            ),
            onInteract: () => {
                this._pickupWorldItem('chicken', w.ovenChicken);
                this.ui.showSubtitle(tr('sub.chicken_pickup'), 3500);
            }
        });

        this._bindStoreAndCookingInteractables();

        w.champagneBottle.addComponent(Interactable, {
            maxDistance: 2.35,
            promptText: () => tr('prompt.champagne_pickup'),
            canInteract: () => (this._droppedItems.has('champagne') || (this.act === 1 && this._isIndoorChoresDone())) && !this.act1Tasks.champagne && !this.player.heldItem,
            onInteract: () => {
                this._pickupWorldItem('champagne', w.champagneBottle);
                this.ui.showSubtitle(tr('sub.champagne_pickup'), 3400);
                this._refreshObjectives();
            }
        });

        w.tvGameObject.addComponent(Interactable, {
            maxDistance: 1.95,
            promptText: () => {
                if (this.act === 4 && !this.act4Inspected.tv) return tr('prompt.tv_news');
                if (this.act === 0 || this.act === 1) return tr('prompt.tv_switch_channel');
                return '';
            },
            canInteract: () => (
                (this.act === 4 && !this.act4Inspected.tv) ||
                ((this.act === 0 || this.act === 1) && !this.player.isHidden && !this.player.isPeephole)
            ),
            onInteract: () => {
                if (this.act === 0 || this.act === 1) {
                    const ch = w.crtTV.nextChannel();
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.tvGameObject.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle(tr(`sub.tv_channel_${ch}`), 2600);
                    return;
                }
                const countOthers = ['door', 'table', 'tree'].filter(k => this.act4Inspected[k]).length;
                if (countOthers < 3) {
                    this.ui.showSubtitle(tr('sub.act4_inspect_first'), 3000);
                    return;
                }
                this._triggerTVTwist();
            }
        });

        for (const spot of w.hidingSpots) {
            const hasSolidDoor = spot.id === 'wardrobe' || spot.id === 'pantry';
            if (hasSolidDoor && spot.doorPivot) {
                spot.doorPivot.addComponent(Interactable, {
                    maxDistance: 1.7,
                    promptText: () => spot.getDoorPrompt(),
                    canInteract: () => !this.player.isHidden,
                    onInteract: () => spot.setDoorClosed(!spot.isDoorClosed())
                });
            }

            spot.enterObject.addComponent(Interactable, {
                promptText: spot.enterPrompt,
                maxDistance: 1.65,
                canInteract: () => !this.player.isHidden && (this.act === 3 || (!hasSolidDoor && this.act === 1 && this.phase === 'act1')),
                onInteract: () => {
                    if (this.act === 1) {
                        this.ui.showSubtitle(tr('sub.hide_act1'), 2800);
                        return;
                    }
                    this.player.enterHidingSpot(spot);
                }
            });
        }

        for (const sw of w.lightSwitches) {
            sw.go.addComponent(Interactable, {
                maxDistance: 1.75,
                promptText: () => {
                    const roomLabel = tr(sw.label);
                    if (this.act === 4) return tr('prompt.switch_click', { label: roomLabel });
                    return sw.room.isOn()
                        ? tr('prompt.switch_off', { label: roomLabel })
                        : tr('prompt.switch_on', { label: roomLabel });
                },
                canInteract: () => !this.player.isHidden && !this.player.isPeephole,
                onInteract: () => {
                    this.engine.audioSystem.playSpatialOneShot('pickup', sw.go.transform.position, { volume: 0.45 });
                    if (this.act === 3) {
                        if (sw.room.isOn()) {
                            sw.room.setOn(false);
                        } else {
                            this.ui.showSubtitle(tr('sub.switch_act3'), 3000);
                        }
                        return;
                    }
                    if (this.act === 4) {
                        this.ui.showSubtitle(tr('sub.switch_act4'), 3000);
                        return;
                    }
                    sw.room.toggle();
                }
            });
        }

        if (w.decorQuest) {
            const wardSpot = w.hidingSpots.find(s => s.id === 'wardrobe');
            w.decorQuest.box.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => tr('prompt.decor_box_pickup'),
                canInteract: () => (
                    (this._droppedItems.has('decorBox') || (this.act === 1 && this.act1Tasks.stool && (!wardSpot || !wardSpot.isDoorClosed()))) &&
                    !this.act1Tasks.decorBox &&
                    !this.player.heldItem
                ),
                onInteract: () => {
                    this._droppedItems.delete('decorBox');
                    this._removeFlyingProp(w.decorQuest.box);
                    w.decorQuest.box.transform.rotation.set(0, 0, 0);
                    this.act1Tasks.decorBox = true;
                    w.decorQuest.box.transform.visible = false;
                    this.player.setHeldItem('decorBox');
                    this._syncDecorBoxVisuals();
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.decorQuest.box.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle(tr('sub.decor_box_pickup'), 3800);
                    this._refreshObjectives();
                }
            });

            if (w.wardrobeBoxDropZone) {
                w.wardrobeBoxDropZone.addComponent(Interactable, {
                    maxDistance: 2.2,
                    promptText: () => tr('prompt.return_empty_box'),
                    canInteract: () => (
                        this.act === 1 &&
                        this.act1Tasks.decorate &&
                        this.act1Tasks.garland &&
                        !this.act1Tasks.decorBoxReturned &&
                        this.player.heldItem === 'decorBox' &&
                        (!wardSpot || !wardSpot.isDoorClosed())
                    ),
                    onInteract: () => {
                        this.act1Tasks.decorBoxReturned = true;
                        this.player.setHeldItem(null);
                        w.decorQuest.box.transform.position.set(1.56, 0.0, 3.76);
                        w.decorQuest.box.transform.visible = true;
                        if (w.decorBoxInnerGroup) w.decorBoxInnerGroup.visible = false;
                        this.engine.audioSystem.playSpatialOneShot('pickup', w.wardrobeBoxDropZone.transform.position, { volume: 0.5 });
                        this.ui.showSubtitle(tr('sub.decor_box_returned'), 3400);
                        this._refreshObjectives();
                    }
                });
            }

            const roomSpecs = [
                { key: 'hall', taskKey: 'decorHall', promptKey: 'prompt.decor_hall', quoteKey: 'sub.decor_hall_done' },
                { key: 'kitchen', taskKey: 'decorKitchen', promptKey: 'prompt.decor_kitchen', quoteKey: 'sub.decor_kitchen_done' },
                { key: 'hallway', taskKey: 'decorHallway', promptKey: 'prompt.decor_hallway', quoteKey: 'sub.decor_hallway_done' }
            ];
            for (const spec of roomSpecs) {
                const spotGO = w.decorQuest.spots[spec.key];
                spotGO.addComponent(Interactable, {
                    maxDistance: 1.85,
                    promptText: () => (this.act1Tasks.decorBox ? tr(spec.promptKey) : tr('prompt.decor_need_box')),
                    holdDuration: () => (this.act1Tasks.decorBox ? 1.8 : 0),
                    canInteract: () => this.act === 1 && this.act1Tasks.garland && this.act1Tasks.decorBox && !this.act1Tasks[spec.taskKey],
                    onInteract: () => {
                        if (!this.act1Tasks.decorBox) {
                            this.ui.showSubtitle(tr('sub.decor_need_box'), 3200);
                            return;
                        }
                        this.act1Tasks[spec.taskKey] = true;
                        w.decorQuest.meshes[spec.key].visible = true;
                        if (w.decorQuest.highlights?.[spec.key]) {
                            w.decorQuest.highlights[spec.key].visible = false;
                        }
                        this._syncDecorBoxVisuals();
                        this.engine.audioSystem.playSpatialOneShot('pickup', spotGO.transform.position, { volume: 0.45 });
                        const t = this.act1Tasks;
                        if (t.decorHall && t.decorKitchen && t.decorHallway) {
                            t.decorate = true;
                            this.ui.showSubtitle(
                                t.garland
                                    ? tr('sub.decor_box_empty_return')
                                    : tr('sub.decor_rooms_done'),
                                3800
                            );
                        } else {
                            this.ui.showSubtitle(tr(spec.quoteKey), 3000);
                        }
                        this._refreshObjectives();
                        this._checkAct1IndoorCompletion();
                    }
                });
            }
        }

        w.neighborScene.gazeTrigger.onGazeComplete = () => {
            if (this.act === 2 && this.phase === 'act2_window_lit') {
                this._startAct2ZoomSequence();
            }
        };
    }

    _bindStoreAndCookingInteractables() {
        const w = this.world;

        // --- STORE INTERACTABLES (Prologue: act === 0) ---
        if (w.store) {
            w.store.olivierPackGO.addComponent(Interactable, {
                maxDistance: 2.65,
                promptText: () => tr('prompt.store_take_olivier'),
                canInteract: () => (this._droppedItems.has('olivierPack') || (this.act === 0 && this._inStore)) && !this.prologueTasks.shopOlivierPack,
                onInteract: () => {
                    this._droppedItems.delete('olivierPack');
                    this._removeFlyingProp(w.store.olivierPackGO);
                    w.store.olivierPackGO.transform.rotation.set(0, 0, 0);
                    this.prologueTasks.shopOlivierPack = true;
                    w.store.olivierPackGO.transform.visible = false;
                    w.store.olivierPackHighlight.visible = false;
                    this._syncShoppingBasketVisuals();
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.store.olivierPackGO.transform.position);
                    this.ui.showSubtitle(tr('sub.store_got_olivier'), 3400);
                    this._refreshObjectives();
                }
            });

            w.store.meatPackGO.addComponent(Interactable, {
                maxDistance: 2.65,
                promptText: () => tr('prompt.store_take_meat'),
                canInteract: () => (this._droppedItems.has('meatPack') || (this.act === 0 && this._inStore)) && !this.prologueTasks.shopMeatPack,
                onInteract: () => {
                    this._droppedItems.delete('meatPack');
                    this._removeFlyingProp(w.store.meatPackGO);
                    w.store.meatPackGO.transform.rotation.set(0, 0, 0);
                    this.prologueTasks.shopMeatPack = true;
                    w.store.meatPackGO.transform.visible = false;
                    w.store.meatPackHighlight.visible = false;
                    this._syncShoppingBasketVisuals();
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.store.meatPackGO.transform.position);
                    this.ui.showSubtitle(tr('sub.store_got_meat'), 3400);
                    this._refreshObjectives();
                }
            });

            w.store.exitDoor.addComponent(Interactable, {
                maxDistance: 2.6,
                promptText: () => {
                    if (w.store.isStoreDoorOpen()) return tr('prompt.close_store_door');
                    if (this.player.transform.position.z <= 6.35 && !this.prologueTasks.shopPaid) {
                        return tr('prompt.store_exit_need_pay');
                    }
                    return tr('prompt.enter_store_door');
                },
                canInteract: () => this.act === 0 && this._inStore && !this._storeTransition,
                onInteract: () => {
                    if (this.player.transform.position.z <= 6.35 && !this.prologueTasks.shopPaid) {
                        this.ui.showSubtitle(tr('sub.store_need_pay'), 3600);
                        return;
                    }
                    const nextOpen = !w.store.isStoreDoorOpen();
                    w.store.setStoreDoorOpen(nextOpen);
                    this.engine.audioSystem.playSpatialOneShot('door_open', w.store.exitDoor.transform.position, { volume: 0.65 });
                    if (nextOpen && this.player.transform.position.z > 6.35 && !this._storeEnteredSubtitleShown) {
                        this._storeEnteredSubtitleShown = true;
                        this.ui.showSubtitle(tr('sub.store_entered'), 5200);
                    }
                }
            });

            if (w.store.ironDoor) {
                w.store.ironDoor.addComponent(Interactable, {
                    maxDistance: 2.6,
                    promptText: () => (w.store.isIronDoorOpen() ? tr('prompt.close_iron_door') : tr('prompt.open_iron_door')),
                    canInteract: () => this.act === 0 && this._inStore && !this._storeTransition,
                    onInteract: () => {
                        const nextOpen = !w.store.isIronDoorOpen();
                        w.store.setIronDoorOpen(nextOpen);
                    }
                });
            }

            for (const npc of w.store.npcs) {
                npc.go.addComponent(Interactable, {
                    maxDistance: 2.8,
                    promptText: () => tr(`prompt.talk_${npc.id}`),
                    canInteract: () => this.act === 0 && this._inStore && !this.ui.isDialogueOpen(),
                    onInteract: () => {
                        this._openNPCDialogue(npc.id);
                    }
                });
            }
        }

        // --- KITCHEN COOKING, FRIDGE STORAGE, WASHING & NAP INTERACTABLES (Prologue: act === 0) ---
        if (w.cooking) {
            const c = w.cooking;

            // 1. Drop grocery bag on kitchen table
            c.dropZone.addComponent(Interactable, {
                maxDistance: 1.9,
                promptText: () => tr('prompt.drop_groceries'),
                canInteract: () => (
                    this.act === 0 &&
                    this.prologueTasks.shopDone &&
                    !this.prologueTasks.groceriesPlaced &&
                    this.player.heldItem === 'groceryBag'
                ),
                onInteract: () => {
                    this.prologueTasks.groceriesPlaced = true;
                    this.player.setHeldItem(null);
                    c.dropHighlight.visible = false;
                    c.bagMesh.visible = true;
                    c.boardGO.transform.visible = true;
                    c.olivierPrep.visible = true;
                    c.meatPrep.visible = false;
                    c.rawChickenGO.transform.visible = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', c.dropZone.transform.position, { volume: 0.55 });
                    this.ui.showSubtitle(tr('sub.groceries_unpacked'), 4400);
                    this._refreshObjectives();
                }
            });

            // 2. Cutting board: Interactive mouse-driven slicing for Olivier & Meat, AND picking up the board with knife to wash in the sink!
            c.boardGO.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => {
                    const p = this.prologueTasks;
                    if (!p.cookOlivier) return tr('prompt.cook_olivier');
                    if (!p.cookMeat) return tr('prompt.cook_meat');
                    if (!p.boardPicked) return tr('prompt.board_pickup_wash');
                    return '';
                },
                canInteract: () => {
                    const p = this.prologueTasks;
                    if (this._cookingInProgress) return false;
                    if (this._droppedItems.has('dirtyBoard') && !p.boardPicked) return true;
                    if (this.act !== 0 || !p.groceriesPlaced) return false;
                    if (!p.cookOlivier || !p.cookMeat) {
                        return !this.player.heldItem;
                    }
                    // After chicken is in oven and Olivier & Meat are stored in the fridge, player can pick up the cutting board & knife to wash!
                    if (p.chickenInOven && p.olivierInFridge && p.meatInFridge && !p.boardPicked && !p.kitchenCleaned) {
                        return !this.player.heldItem || this.player.heldItem === 'sponge';
                    }
                    return false;
                },
                onInteract: () => {
                    const p = this.prologueTasks;
                    const boardTarget = c.boardGO.transform.position.clone().add(new THREE.Vector3(0, 0.04, 0));
                    if (!p.cookOlivier) {
                        this._cookingInProgress = true;
                        this.ui.showSubtitle(tr('sub.cooking_olivier_mouse'), 4500);
                        this.player.startCookingAnimation(
                            2.7,
                            (r) => this.ui.setHoldProgress(r),
                            () => {
                                this.ui.setHoldProgress(0);
                                this._cookingInProgress = false;
                                p.cookOlivier = true;
                                c.olivierPrep.visible = false;
                                c.cookedOlivierGO.transform.visible = true;
                                if (!p.cookMeat) c.meatPrep.visible = true;
                                this.engine.audioSystem.playSpatialOneShot('pickup', c.boardGO.transform.position);
                                this.ui.showSubtitle(tr('sub.cooked_olivier_done'), 3600);
                                this._refreshObjectives();
                            },
                            boardTarget,
                            'olivier'
                        );
                    } else if (!p.cookMeat) {
                        this._cookingInProgress = true;
                        this.ui.showSubtitle(tr('sub.cooking_meat_mouse'), 4500);
                        this.player.startCookingAnimation(
                            2.4,
                            (r) => this.ui.setHoldProgress(r),
                            () => {
                                this.ui.setHoldProgress(0);
                                this._cookingInProgress = false;
                                p.cookMeat = true;
                                c.meatPrep.visible = false;
                                c.cookedMeatGO.transform.visible = true;
                                this.engine.audioSystem.playSpatialOneShot('pickup', c.boardGO.transform.position);
                                this.ui.showSubtitle(tr('sub.cooked_meat_done'), 3600);
                                this._refreshObjectives();
                            },
                            boardTarget,
                            'meat'
                        );
                    } else if (!p.boardPicked) {
                        this._droppedItems.delete('dirtyBoard');
                        this._removeFlyingProp(c.boardGO);
                        c.boardGO.transform.rotation.set(0, 0, 0);
                        p.boardPicked = true;
                        p.boardInSink = false;
                        c.boardGO.transform.visible = false;
                        c.cookHighlight.visible = false;
                        this.player.setHeldItem('dirtyBoard');
                        this.engine.audioSystem.playSpatialOneShot('pickup', c.boardGO.transform.position);
                        this.ui.showSubtitle(
                            p.spongePicked ? tr('sub.board_picked_to_wash') : tr('sub.board_picked_need_sponge'),
                            4000
                        );
                        this._refreshObjectives();
                    }
                }
            });

            // 3. Pick up freshly cooked Olivier from kitchen table (only after chicken is in oven)
            c.cookedOlivierGO.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => tr('prompt.olivier_pickup'),
                canInteract: () => (
                    (this._droppedItems.has('olivier') || (this.act === 0 && this.prologueTasks.chickenInOven && this.prologueTasks.cookOlivier)) &&
                    c.cookedOlivierGO.transform.visible &&
                    !this.prologueTasks.olivierInFridge &&
                    !this.player.heldItem
                ),
                onInteract: () => {
                    this._pickupWorldItem('olivier', c.cookedOlivierGO);
                    this.ui.showSubtitle(tr('sub.put_in_fridge_hint'), 3200);
                }
            });

            // 4. Pick up freshly sliced Meat & Cheese platter from kitchen table (only after chicken is in oven)
            c.cookedMeatGO.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => tr('prompt.meat_pickup'),
                canInteract: () => (
                    (this._droppedItems.has('meat') || (this.act === 0 && this.prologueTasks.chickenInOven && this.prologueTasks.cookMeat)) &&
                    c.cookedMeatGO.transform.visible &&
                    !this.prologueTasks.meatInFridge &&
                    !this.player.heldItem
                ),
                onInteract: () => {
                    this._pickupWorldItem('meat', c.cookedMeatGO);
                    this.ui.showSubtitle(tr('sub.put_in_fridge_hint'), 3200);
                }
            });

            // 5. Put Olivier or Meat platter into the open Fridge
            c.fridgeDropGO.addComponent(Interactable, {
                maxDistance: 1.8,
                promptText: () => (
                    this.player.heldItem === 'olivier'
                        ? tr('prompt.put_olivier_fridge')
                        : tr('prompt.put_meat_fridge')
                ),
                canInteract: () => (
                    this.act === 0 &&
                    w.fridge.isOpen() &&
                    (this.player.heldItem === 'olivier' || this.player.heldItem === 'meat')
                ),
                onInteract: () => {
                    if (this.player.heldItem === 'olivier') {
                        this.prologueTasks.olivierInFridge = true;
                        w.fridgeOlivier.transform.visible = true;
                    } else if (this.player.heldItem === 'meat') {
                        this.prologueTasks.meatInFridge = true;
                        w.fridgeMeat.transform.visible = true;
                    }
                    this.player.setHeldItem(null);
                    this.engine.audioSystem.playSpatialOneShot('pickup', c.fridgeDropGO.transform.position);
                    if (this.prologueTasks.olivierInFridge && this.prologueTasks.meatInFridge) {
                        this.ui.showSubtitle(tr('sub.fridge_food_stored'), 3800);
                    }
                    this._refreshObjectives();
                }
            });

            // 6. Pick up raw seasoned chicken tray to put into oven (only after Olivier & Meat are prepared)
            c.rawChickenGO.addComponent(Interactable, {
                maxDistance: 2.35,
                promptText: () => tr('prompt.raw_chicken_pickup'),
                canInteract: () => (
                    (this._droppedItems.has('rawChicken') || (this.act === 0 && this.prologueTasks.cookOlivier && this.prologueTasks.cookMeat)) &&
                    c.rawChickenGO.transform.visible &&
                    !this.prologueTasks.chickenInOven &&
                    !this.player.heldItem
                ),
                onInteract: () => {
                    this._pickupWorldItem('rawChicken', c.rawChickenGO);
                    this.ui.showSubtitle(tr('sub.raw_chicken_pickup'), 3600);
                    this._refreshObjectives();
                }
            });

            // 7. Place raw chicken inside open oven -> starts long baking timer
            c.ovenBakeZoneGO.addComponent(Interactable, {
                maxDistance: 1.8,
                promptText: () => tr('prompt.put_chicken_oven'),
                canInteract: () => (
                    this.act === 0 &&
                    w.stove.isOpen() &&
                    !this.prologueTasks.chickenInOven &&
                    this.player.heldItem === 'rawChicken'
                ),
                onInteract: () => {
                    this.player.setHeldItem(null);
                    this.prologueTasks.chickenInOven = true;
                    c.ovenRawChicken.visible = true;
                    this._ovenBaking = true;
                    this._ovenBakeTimer = 0;
                    w.stove.setOpen(false, true, false);
                    this.engine.audioSystem.playSpatialOneShot('steam_hiss', c.ovenBakeZoneGO.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle(tr('sub.chicken_baking_long'), 4600);
                    this._refreshObjectives();
                }
            });

            // 7b. Interactive Kitchen Faucet (open/close water stream at any time)
            if (w.kitchenFaucet?.go) {
                w.kitchenFaucet.go.addComponent(Interactable, {
                    maxDistance: 1.85,
                    promptText: () => (w.kitchenFaucet.isOn() ? tr('prompt.faucet_close') : tr('prompt.faucet_open')),
                    canInteract: () => !this.player.isHidden && !this.player.isPeephole && !this._cookingInProgress,
                    onInteract: () => {
                        w.kitchenFaucet.toggle();
                    }
                });
            }

            // 7c. Kitchen Sponge in Hallway Wardrobe (taken after food is in fridge)
            if (w.wardrobeSponge) {
                const wardSpot = w.hidingSpots.find(s => s.id === 'wardrobe');
                w.wardrobeSponge.addComponent(Interactable, {
                    maxDistance: 2.35,
                    promptText: () => tr('prompt.sponge_pickup'),
                    canInteract: () => (
                        (this._droppedItems.has('sponge') || (
                            this.act === 0 &&
                            this.prologueTasks.chickenInOven &&
                            this.prologueTasks.olivierInFridge &&
                            this.prologueTasks.meatInFridge &&
                            (!wardSpot || !wardSpot.isDoorClosed())
                        )) &&
                        !this.prologueTasks.spongePicked &&
                        (!this.player.heldItem || this.player.heldItem === 'dirtyBoard')
                    ),
                    onInteract: () => {
                        this._droppedItems.delete('sponge');
                        this._removeFlyingProp(w.wardrobeSponge);
                        w.wardrobeSponge.transform.rotation.set(0, 0, 0);
                        this.prologueTasks.spongePicked = true;
                        w.wardrobeSponge.transform.visible = false;
                        this.player.setHeldItem('sponge');
                        this.engine.audioSystem.playSpatialOneShot('pickup', w.wardrobeSponge.transform.position);
                        this.ui.showSubtitle(
                            this.prologueTasks.boardPicked ? tr('sub.sponge_picked') : tr('sub.sponge_picked_need_board'),
                            3800
                        );
                        this._refreshObjectives();
                    }
                });
            }

            // 8. Kitchen Sink: Place dirty board in sink OR wash cutting board & knife with sponge
            if (w.kitchenSinkGO) {
                w.kitchenSinkGO.addComponent(Interactable, {
                    maxDistance: 2.35,
                    targetMeshes: w.kitchenSinkMeshes || null,
                    promptText: () => {
                        const p = this.prologueTasks;
                        if (p.boardPicked && !p.spongePicked && !p.boardInSink) {
                            return tr('prompt.put_board_in_sink');
                        }
                        if (!p.boardPicked && p.spongePicked) {
                            return tr('prompt.wash_need_board');
                        }
                        return w.kitchenFaucet && !w.kitchenFaucet.isOn()
                            ? tr('prompt.wash_need_faucet')
                            : tr('prompt.wash_board_sink');
                    },
                    canInteract: () => {
                        const p = this.prologueTasks;
                        if (this.act !== 0 || p.kitchenCleaned || this._cookingInProgress) return false;
                        if (p.boardPicked && p.spongePicked) return true;
                        if (p.boardPicked && !p.spongePicked && !p.boardInSink) return true;
                        if (!p.boardPicked && p.spongePicked) return true;
                        return false;
                    },
                    onInteract: () => {
                        const p = this.prologueTasks;
                        if (p.boardPicked && !p.spongePicked) {
                            p.boardInSink = true;
                            this.player.setHeldItem(null);
                            c.boardGO.transform.position.set(3.75, 0.74, -1.25);
                            c.boardGO.transform.rotation.set(0, 0.25, 0);
                            c.boardGO.transform.visible = true;
                            this.engine.audioSystem.playSpatialOneShot('pickup', w.kitchenSinkGO.transform.position);
                            this.ui.showSubtitle(tr('sub.board_in_sink_get_sponge'), 4200);
                            this._refreshObjectives();
                            return;
                        }
                        if (!p.boardPicked && p.spongePicked) {
                            this.ui.showSubtitle(tr('sub.wash_need_board_first'), 3600);
                            return;
                        }
                        if (w.kitchenFaucet && !w.kitchenFaucet.isOn()) {
                            w.kitchenFaucet.setOn(true, true);
                        }
                        c.boardGO.transform.visible = false;
                        this._cookingInProgress = true;
                        this.ui.showSubtitle(tr('sub.washing_sponge_mouse'), 4800);
                        const sinkTarget = new THREE.Vector3(3.76, 0.86, -1.25);
                        this.player.startInteractiveSpongeWash(
                            sinkTarget,
                            (r) => this.ui.setHoldProgress(r),
                            () => {
                                this.ui.setHoldProgress(0);
                                this._cookingInProgress = false;
                                this.player.setHeldItem(null);
                                this.prologueTasks.kitchenCleaned = true;
                                c.bagMesh.visible = false;
                                c.boardGO.transform.visible = false;
                                c.sinkHighlight.visible = false;
                                if (w.kitchenFaucet) w.kitchenFaucet.setOn(false, true);
                                this.ui.showSubtitle(tr('sub.kitchen_cleaned_nap'), 5200);
                                this._refreshObjectives();
                            }
                        );
                    }
                });
            }

            // 9. Living room Sofa: lie down for a nap while chicken bakes -> transitions to classic Act I (23:30)!
            if (w.sofaNapGO) {
                w.sofaNapGO.addComponent(Interactable, {
                    maxDistance: 2.0,
                    promptText: () => tr('prompt.sofa_nap'),
                    canInteract: () => (
                        this.act === 0 &&
                        this.phase === 'prologue' &&
                        this.prologueTasks.kitchenCleaned &&
                        !this.prologueTasks.napped &&
                        !this.player.heldItem
                    ),
                    onInteract: () => {
                        this._startPrologueNap();
                    }
                });
            }
        }
    }

    _startPrologueNap() {
        this.prologueTasks.napped = true;
        this.phase = 'prologue_falling_asleep';
        this.phaseTimer = 0;
        if (this.world.cooking?.sofaHighlight) this.world.cooking.sofaHighlight.visible = false;
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        const sp = this.world.playerSpawn || { position: new THREE.Vector3(-2.65, 0.05, -1.0), yaw: -Math.PI / 2, pitch: -0.05 };
        this.player.setPose(sp.position.clone(), sp.yaw, sp.pitch);
        this.player.eyeHeight = 0.92;
        this.player.targetEyeHeight = 0.92;
        this.engine.audioSystem.playSpatialOneShot('wood_creak', sp.position, { volume: 0.45 });
        this.ui.showSubtitle(tr('sub.nap_falling_asleep'), 3000);
        this.ui.setObjectives('', []);
    }

    _enterGroceryStore() {
        if (this._storeTransition || this._inStore) return;
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        this.player.isCrouching = false;
        this.player.targetEyeHeight = 1.54;
        if (this.player.rb) {
            this.player.rb.useGravity = false;
            this.player.rb.velocity.set(0, 0, 0);
        }
        if (this.player.collider) this.player.collider.enabled = false;
        if (this.world.frontDoor?.collider) this.world.frontDoor.collider.enabled = false;
        this._storeEnteredSubtitleShown = false;
        this._storeTransition = {
            target: 'store',
            timer: 0,
            switched: false,
            doorSoundPlayed: false,
            ironCreakPlayed: false,
            stepTimer: 0.15,
            startPos: this.player.transform.position.clone(),
            lookTarget: new THREE.Vector3(3.075, 1.32, 4.5)
        };
        this.player.forcedLookTarget = this._storeTransition.lookTarget;
        this.player.forcedLookSpeed = 5.5;
    }

    _exitGroceryStore() {
        if (this._storeTransition || !this._inStore) return;
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        if (this.player.rb) {
            this.player.rb.useGravity = false;
            this.player.rb.velocity.set(0, 0, 0);
        }
        if (this.player.collider) this.player.collider.enabled = false;
        if (this.world.frontDoor?.collider) this.world.frontDoor.collider.enabled = false;
        this._storeTransition = {
            target: 'home',
            timer: 0,
            switched: false,
            doorOpened: false,
            stepTimer: 0.15,
            lookTarget: new THREE.Vector3(3.075, 1.32, 4.5)
        };
    }

    _syncDecorBoxVisuals() {
        const t = this.act1Tasks || {};
        this.player.setDecorBoxContents?.({
            tree: !t.garland,
            hall: !t.decorHall,
            kitchen: !t.decorKitchen,
            hallway: !t.decorHallway
        });
    }

    _syncShoppingBasketVisuals() {
        const p = this.prologueTasks || {};
        const hasAny = !!(p.shopOlivierPack || p.shopMeatPack);
        this.player.setShoppingBasketContents?.({
            olivier: !!p.shopOlivierPack,
            meat: !!p.shopMeatPack
        });
        if (!p.shopPaid) {
            this.player.setHeldItem(hasAny ? 'shoppingBasket' : null);
        }
    }

    _openNPCDialogue(npcId) {
        this._activeNpcId = npcId;
        this._talkedNPCs.add(npcId);
        this.player.controlsLocked = true;

        const speakerName = tr(`npc.${npcId}.name`);
        const buildChoices = () => {
            const choices = [];
            if (npcId === 'galya' && !this.prologueTasks.shopPaid) {
                const hasItems = this.prologueTasks.shopOlivierPack && this.prologueTasks.shopMeatPack;
                choices.push({
                    id: 'pay',
                    primary: true,
                    label: hasItems ? tr('dlg.galya.opt_pay_ready') : tr('dlg.galya.opt_pay_empty')
                });
            }
            for (const tid of ['t1', 't2', 't3']) {
                if (!this._askedDialogTopics.has(`${npcId}:${tid}`)) {
                    choices.push({ id: tid, label: tr(`dlg.${npcId}.opt${tid.slice(1)}`) });
                }
            }
            choices.push({ id: 'bye', label: tr('dlg.common.bye') });
            return choices;
        };

        const greetingKey = (npcId === 'galya' && this.prologueTasks.shopPaid)
            ? 'dlg.galya.greeting_paid'
            : `dlg.${npcId}.greeting`;

        this.ui.openDialogue(
            speakerName,
            tr(`npc.${npcId}.role`),
            tr(greetingKey),
            buildChoices(),
            (choice) => {
                if (choice.id === 'bye') {
                    this.ui.closeDialogue();
                    return;
                }
                if (choice.id === 'pay') {
                    if (this.prologueTasks.shopOlivierPack && this.prologueTasks.shopMeatPack) {
                        this.prologueTasks.shopPaid = true;
                        this.player.setHeldItem('groceryBag');
                        this.engine.audioSystem.playSpatialOneShot('pickup', this.player.transform.position, { volume: 0.55 });
                        this._refreshObjectives();
                        this.ui.updateDialogue(tr('dlg.galya.reply_paid'), buildChoices());
                    } else {
                        this.ui.updateDialogue(tr('dlg.galya.reply_need_items'), buildChoices());
                    }
                    return;
                }
                // Stay in dialogue, hide this specific asked option, and show the NPC's reply
                this._askedDialogTopics.add(`${npcId}:${choice.id}`);
                const replyKey = `dlg.${npcId}.reply_${choice.id}`;
                this.ui.updateDialogue(tr(replyKey), buildChoices());
            },
            () => {
                this._activeNpcId = null;
                this.player.controlsLocked = false;
            }
        );
    }

    _isFoodOrTableItem(key) {
        return ['crystal', 'pickles', 'olivier', 'meat', 'chicken', 'champagne'].includes(key);
    }

    _itemName(key) {
        const map = {
            crystal: 'item.crystal',
            pickles: 'item.pickles',
            olivier: 'item.olivier',
            meat: 'item.meat',
            chicken: 'item.chicken',
            champagne: 'item.champagne'
        };
        return map[key] ? tr(map[key]) : key;
    }

    _isIndoorChoresDone() {
        const t = this.act1Tasks;
        return !!(
            t.peephole &&
            t.wash &&
            t.garland &&
            t.decorate &&
            t.decorBoxReturned &&
            t.table &&
            t.stool &&
            t.crystal &&
            t.pickles &&
            t.olivier &&
            t.meat &&
            t.chicken
        );
    }

    _checkAct1IndoorCompletion() {
        this._checkAct1HorrorEvents();
        if (this._isIndoorChoresDone()) {
            if (this.act1Tasks.champagne) {
                this.ui.showSubtitle(tr('sub.chores_all_done'), 4400);
            } else {
                this.ui.showSubtitle(tr('sub.chores_need_champagne'), 4200);
            }
        }
    }

    _checkAct1HorrorEvents() {
        if (this.act !== 1 || !this.act1Tasks.peephole) return;
        const t = this.act1Tasks;
        const count = [
            t.tablePlaced, t.table, t.stool, t.garland, t.decorate,
            t.crystal, t.pickles, t.olivier, t.meat, t.chicken, t.champagne
        ].filter(Boolean).length;

        const a = this.engine.audioSystem;
        const w = this.world;

        if (count >= 2 && !this._horrorEventsTriggered.has(1)) {
            this._horrorEventsTriggered.add(1);
            // Event 1: Brief TV static glitch + eerie low thrum + horror level 1 on TV channels
            w.crtTV.setHorrorLevel?.(1);
            w.crtTV.setMode('static', false);
            this.engine.renderer.triggerGlitch(0.45);
            a.playSpatialOneShot('creak', new THREE.Vector3(1.58, 0.94, -1.0), { volume: 0.55 });
            setTimeout(() => {
                if (this.act === 1 && w.crtTV) w.crtTV.setMode('ogonyok', false);
            }, 1400);
            this.ui.showSubtitle(tr('sub.suspense_tv'), 3600);
        } else if (count >= 5 && !this._horrorEventsTriggered.has(2)) {
            this._horrorEventsTriggered.add(2);
            // Event 2: Metallic scratch & footsteps outside the front door in the stairwell
            a.playSpatialOneShot('knife_drag', new THREE.Vector3(3.08, 1.2, 4.65), { volume: 0.85, refDistance: 2.5 });
            this.ui.showSubtitle(tr('sub.suspense_scratch'), 4000);
        } else if (count >= 8 && !this._horrorEventsTriggered.has(3)) {
            this._horrorEventsTriggered.add(3);
            // Event 3: Lights flicker in apartment + distant thud from neighbor house + horror level 2 on TV
            w.crtTV.setHorrorLevel?.(2);
            if (w.lights.kitchenLight) w.lights.kitchenLight.intensity = 0.2;
            if (w.lights.hallwayLight) w.lights.hallwayLight.intensity = 0.15;
            this.engine.renderer.triggerGlitch(0.5);
            a.playSpatialOneShot('door_pound', new THREE.Vector3(-1.0, 1.0, -18.0), { volume: 0.45, maxDistance: 45 });
            setTimeout(() => {
                if (this.act === 1) {
                    if (w.roomLights.kitchen?.isOn()) w.lights.kitchenLight.intensity = 3.3;
                    if (w.roomLights.hallway?.isOn()) w.lights.hallwayLight.intensity = 3.1;
                }
            }, 650);
            this.ui.showSubtitle(tr('sub.suspense_flicker'), 3600);
        } else if (count >= 10 && !this._horrorEventsTriggered.has(4)) {
            this._horrorEventsTriggered.add(4);
            // Event 4: Cold draft creak from the balcony + delayed reflection head turn in sideboard mirror
            this.player.mirrorCreepyTimer = 4.5;
            a.playSpatialOneShot('wood_creak', new THREE.Vector3(0.4, 1.2, -3.5), { volume: 0.75 });
        }
    }

    _enterTableDinnerScene() {
        this.phase = 'act1_sitting_table';
        this.phaseTimer = 0;
        this._tableDinnerStep = 0;
        this._tableDinnerTimer = 0;

        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = true;
        this.player.isCrouching = false;
        this.player.targetEyeHeight = 1.06;
        this.player.eyeHeight = 1.06;
        // Sit on the stool looking across the table toward the TV
        const stoolPos = this.world.placedHallStool
            ? this.world.placedHallStool.transform.position
            : new THREE.Vector3(-1.35, 0, -1.96);
        const tvPos = this.world.tvGameObject
            ? this.world.tvGameObject.transform.position
            : new THREE.Vector3(1.58, 0.94, -1.0);
        const sitYaw = Math.atan2(-(tvPos.x - stoolPos.x), -(tvPos.z - stoolPos.z));
        this.player.setPose(new THREE.Vector3(stoolPos.x, 0.05, stoolPos.z), sitYaw, -0.05);
        this.player.lookYawCenter = sitYaw;
        this.player.lookYawLimit = 1.25;
        this.player.lookPitchMin = -0.55;
        this.player.lookPitchMax = 0.45;

        this.engine.audioSystem.playSpatialOneShot('footstep_parquet', stoolPos, { volume: 0.4 });
        this.ui.showSubtitle(tr('sub.dinner_sit'), 3800);
        this.ui.setObjectives(tr('obj.act1.dinner_title'), [
            { text: tr('obj.act1.pour_drink'), done: false }
        ]);
    }

    stopAllAudioLoops() {
        const a = this.engine.audioSystem;
        ['menu_music', 'tv_audio', 'fridge_hum', 'clock_tick', 'wind', 'horror_darkness', 'heartbeat', 'monster_breath', 'melancholy'].forEach(id => a.stopLoop(id));
        a.stopTVBroadcast?.();
        this.engine.renderer.setPostProcessParams({ fade: 1.0, panic: 0.0, wakeVignette: 0.0 });
        this.ui.setWakePrompt('', false);
        this.ui.setCleanIntroMode(false);
        this.phase = 'menu';
    }

    _resetWorldForRun(fromCheckpoint) {
        const w = this.world;
        this.stopAllAudioLoops();

        if (this.player.isHidden) this.player.exitHidingSpot();
        if (this.player.isPeephole || this.player._peepholeAnim) this.player.exitPeephole(true);
        this.player.controlsLocked = false;
        this.player.allowLookWhileLocked = false;
        this.player.lookYawCenter = null;
        this.player.forcedLookTarget = null;
        this.player.forcedLookSpeed = 5.0;
        this.player.forcedFov = null;
        this.player.cinematicBobOffset = 0;
        this.player.cinematicRollOffset = 0;
        this.player.setCigarette(false);
        this.player.setHeldItem(null);
        this._fadeVal = 1.0;
        this._twistStep = 0;
        this._horrorEventsTriggered.clear();
        this.engine.renderer.setPostProcessParams({ fade: 1.0, panic: 0.0, wakeVignette: 0.0 });

        if (w.frontDoor.initialPos) {
            w.frontDoor.go.transform.position.copy(w.frontDoor.initialPos);
        } else {
            w.frontDoor.go.transform.position.set(3.075, 1.075, 4.5);
        }
        if (w.frontDoor.initialRot) {
            w.frontDoor.go.transform.rotation.copy(w.frontDoor.initialRot);
        } else {
            w.frontDoor.go.transform.rotation.set(0, 0, 0);
        }
        w.frontDoor.clawDecal.visible = false;
        w.frontDoor.collider.enabled = true;

        if (w.treeInitialPos) {
            w.treeGO.transform.position.copy(w.treeInitialPos);
        } else {
            w.treeGO.transform.position.set(-2.75, 0, 0.85);
        }
        if (w.treeInitialRot) {
            w.treeGO.transform.rotation.copy(w.treeInitialRot);
        } else {
            w.treeGO.transform.rotation.set(0, 0, 0);
        }
        w.fallenSantaHat.visible = false;
        if (w.brokenBaubles) w.brokenBaubles.visible = false;
        w.fallenMirror.visible = false;
        if (w.sideboardMirror) w.sideboardMirror.visible = true;

        w.table.go.transform.visible = true;
        w.table.wreckedGO.transform.visible = false;
        if (w.tablePlacementZone?.go) w.tablePlacementZone.go.transform.visible = false;
        if (w.stoolPlacementZone) w.stoolPlacementZone.transform.visible = false;

        w.neighborScene.targetWinFrame.position.copy(w.neighborScene.windowPos);
        w.neighborScene.targetWinFrame.rotation.set(0, 0, 0);
        w.neighborScene.targetWinFrame.visible = true;
        w.neighborScene.bloodGlass.visible = false;
        if (w.neighborScene.initialVictimPos) {
            w.neighborScene.victimGroup.position.copy(w.neighborScene.initialVictimPos);
        } else {
            w.neighborScene.victimGroup.position.set(-1.35, 0.9, -25.6);
        }
        w.neighborScene.gazeTrigger.reset();
        w.neighborScene.gazeTrigger.enabled = false;
        w.lights.neighborLight.intensity = 0;
        if (w.neighborWindowCanvas) {
            w.neighborWindowCanvas.setWatcherEyes?.(false);
            w.neighborWindowCanvas.setMode('dark');
        }
        if (w.crtTV) w.crtTV.setHorrorLevel?.(0);
        this.monster.setIdleInNeighborRoom();

        w.hidingSpots.forEach(s => s.setDoorClosed(!!s.defaultClosed, true));
        w.powerOut = false;
        this._balconySniffQuote = false;
        this._balconyPoundQuote = false;
        this._endingTriggered = false;
        this._washingInProgress = false;
        this._treeDecoratingInProgress = false;
        this._cookingInProgress = false;
        this._inStore = false;
        this._activeNpcId = null;
        this._storeTransition = null;
        this._ovenBaking = false;
        this._ovenBakeTimer = 0;
        this._talkedNPCs.clear();
        this._askedDialogTopics.clear();
        this._droppedItems.clear();
        this._flyingProps = [];
        this._smokePromptState = '';
        this._peepholeStalkerSeen = false;
        this._peepholeScratchDone = false;
        this._act3DistractionDone = false;
        this._act3KettleDone = false;
        this._lowOxygenWhisperTimer = 0;
        this._balconyWatcherTimer = 0;
        this.player.setShoppingBasketContents?.({ olivier: false, meat: false });
        this.player.mirrorCreepyTimer = 0;
        const scene = this.engine.renderer?.scene;
        if (this._peeState?.streamMeshes && scene) {
            for (const m of this._peeState.streamMeshes) {
                scene.remove(m);
            }
        }
        if (this._peeState?.streamLine && scene) {
            scene.remove(this._peeState.streamLine);
        }
        this._peeState = null;
        if (this._peeDecals?.length && scene) {
            for (const d of this._peeDecals) {
                scene.remove(d.mesh || d);
            }
            this._peeDecals = [];
        }
        if (this._peeCanvasSurfaces) {
            for (const s of Object.values(this._peeCanvasSurfaces)) {
                if (s?.mesh && scene) scene.remove(s.mesh);
                if (s?.tex) s.tex.dispose();
            }
            this._peeCanvasSurfaces = null;
        }
        w.bathroomFaucet?.setOn(false);
        w.kitchenFaucet?.setOn(false, false);
        if (w.tablePlaceMarker) w.tablePlaceMarker.visible = false;
        this.player.setDecorBoxContents?.({ tree: true, hall: true, kitchen: true, hallway: true });
        this.ui.closeDialogue(true);
        this._knockTurnedToRun = false;
        this._knockRepeatTimer = 0;
        if (this._stairRunTimers) {
            this._stairRunTimers.forEach(id => clearTimeout(id));
            this._stairRunTimers = [];
        }
        this.engine.audioSystem.stopOneShotsByType?.('door_knock');
        if (this.player.rb) this.player.rb.useGravity = true;
        if (this.player.collider) this.player.collider.enabled = true;

        if (w.roomLights.hall) w.roomLights.hall.setOn(!!fromCheckpoint);
        if (w.roomLights.kitchen) w.roomLights.kitchen.setOn(true);
        if (w.roomLights.hallway) w.roomLights.hallway.setOn(true);
        if (w.roomLights.bathroom) w.roomLights.bathroom.setOn(true);
        if (w.interiorDoors) {
            for (const door of w.interiorDoors) door.setOpen(!!fromCheckpoint, false, true);
        }
        if (w.doors?.balcony?.glassMesh) {
            w.doors.balcony.glassMesh.visible = true;
        }
        w.cigSmokeEmitter.setActive(false);

        this.engine.renderer.setFOV(75);
        this.engine.renderer.setPostProcessParams({ panic: 0, peephole: 0, fade: 1.0, wakeVignette: 0.0 });
        const vhsVal = this.ui?.el?.rngVhs ? parseFloat(this.ui.el.rngVhs.value) : 0.5;
        this.ui?.applyVHSIntensity?.(vhsVal);

        if (!fromCheckpoint) {
            w.sideboardCrystal.transform.visible = true;
            w.pantryPickles.transform.visible = true;
            // In a fresh run, Olivier, Meat platter & Chicken come from Store + Cooking stage
            w.fridgeOlivier.transform.visible = false;
            w.fridgeMeat.transform.visible = false;
            w.ovenChicken.transform.visible = false;
            w.champagneBottle.transform.visible = true;
            if (w.store) {
                w.store.olivierPackGO.transform.visible = true;
                w.store.meatPackGO.transform.visible = true;
                w.store.olivierPackHighlight.visible = true;
                w.store.meatPackHighlight.visible = true;
            }
            if (w.cooking) {
                w.cooking.dropHighlight.visible = false;
                w.cooking.bagMesh.visible = false;
                w.cooking.boardGO.transform.position.set(2.40, 0.768, -2.44);
                w.cooking.boardGO.transform.rotation.set(0, 0, 0);
                w.cooking.boardGO.transform.visible = false;
                w.cooking.cookHighlight.visible = false;
                w.cooking.olivierPrep.visible = false;
                w.cooking.meatPrep.visible = false;
                w.cooking.cookedOlivierGO.transform.visible = false;
                w.cooking.cookedMeatGO.transform.visible = false;
                w.cooking.rawChickenGO.transform.visible = false;
                w.cooking.ovenRawChicken.visible = false;
            }
            if (w.wardrobeTablecloth) w.wardrobeTablecloth.transform.visible = true;
            if (w.kitchenStool) w.kitchenStool.transform.visible = true;
            if (w.placedHallStool) w.placedHallStool.transform.visible = false;
            if (w.decorQuest) {
                w.decorQuest.box.transform.visible = true;
                w.decorQuest.meshes.hall.visible = false;
                w.decorQuest.meshes.kitchen.visible = false;
                w.decorQuest.meshes.hallway.visible = false;
                if (w.decorQuest.highlights) {
                    w.decorQuest.highlights.hall.visible = false;
                    w.decorQuest.highlights.kitchen.visible = false;
                    w.decorQuest.highlights.hallway.visible = false;
                }
            }
            if (w.mistletoe) {
                w.mistletoe.hanging.visible = true;
                w.mistletoe.trampled.visible = false;
            }
            w.setTreeDecorProgress?.(0.0);
            if (w.treeDecorHighlight) w.treeDecorHighlight.visible = false;
            if (w.tornGarland) w.tornGarland.visible = false;
            if (w.courtyardStroller) {
                w.courtyardStroller.visible = false;
                w.courtyardStroller.position.set(-14.0, -8.5, -17.5);
            }
            w.table.placeOnBalcony();
            this._tableStage = 'on_balcony';
            Object.values(w.itemsOnTable).forEach(m => { m.visible = false; });
            w.fridge.setOpen(false, false, true);
            w.stove.setOpen(false, false, true);
            w.doors.balcony.setOpen(false, false, true);
            w.balconyWindow?.setOpen(false, false, true);
            w.garlandOn = false;
            w.crtTV.setMode('ogonyok', false);
        } else {
            w.sideboardCrystal.transform.visible = false;
            w.pantryPickles.transform.visible = false;
            w.fridgeOlivier.transform.visible = false;
            w.fridgeMeat.transform.visible = false;
            w.ovenChicken.transform.visible = false;
            w.champagneBottle.transform.visible = false;
            if (w.cooking) {
                w.cooking.dropHighlight.visible = false;
                w.cooking.bagMesh.visible = false;
                w.cooking.boardGO.transform.position.set(2.40, 0.768, -2.44);
                w.cooking.boardGO.transform.rotation.set(0, 0, 0);
                w.cooking.boardGO.transform.visible = false;
                w.cooking.cookHighlight.visible = false;
                w.cooking.cookedOlivierGO.transform.visible = false;
                w.cooking.cookedMeatGO.transform.visible = false;
                w.cooking.rawChickenGO.transform.visible = false;
                w.cooking.ovenRawChicken.visible = false;
            }
            if (w.wardrobeTablecloth) w.wardrobeTablecloth.transform.visible = false;
            if (w.kitchenStool) w.kitchenStool.transform.visible = false;
            if (w.placedHallStool) w.placedHallStool.transform.visible = true;
            if (w.decorQuest) {
                w.decorQuest.box.transform.visible = false;
                w.decorQuest.meshes.hall.visible = true;
                w.decorQuest.meshes.kitchen.visible = true;
                w.decorQuest.meshes.hallway.visible = true;
                if (w.decorQuest.highlights) {
                    w.decorQuest.highlights.hall.visible = false;
                    w.decorQuest.highlights.kitchen.visible = false;
                    w.decorQuest.highlights.hallway.visible = false;
                }
            }
            w.setTreeDecorProgress?.(1.0);
            if (w.treeDecorHighlight) w.treeDecorHighlight.visible = false;
            w.table.unfold();
            this._tableStage = 'unfolded';
            Object.values(w.itemsOnTable).forEach(m => { m.visible = true; });
            w.doors.balcony.setOpen(true, false, true);
            w.garlandOn = true;
            w.crtTV.setMode('ogonyok', false);
        }
    }

    setupMainMenuScene() {
        this._resetWorldForRun(true);
        const w = this.world;
        this.phase = 'menu';
        this.act = 0;
        this.phaseTimer = 0;
        if (w.crtTV) w.crtTV.setMode('off', false);
        if (w.neighborWindowCanvas) w.neighborWindowCanvas.setMode('lit_idle');
        if (w.lights?.neighborLight) w.lights.neighborLight.intensity = 1.6;
        w.doors?.balcony?.setOpen(false, false, true);
        w.balconyWindow?.setOpen(false, false, true);
        w.garlandOn = true;
        if (w.decorQuest?.meshes?.hall) w.decorQuest.meshes.hall.visible = true;

        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        this.player.isCrouching = false;
        this.player.targetEyeHeight = 1.54;
        this.player.eyeHeight = 1.54;
        this.player.setPose(new THREE.Vector3(0.45, 0.05, -3.85), 0.12, -0.04);
        this.ensureMenuMusic();
    }

    startNewGame() {
        this._resetWorldForRun(false);
        this.act = 0;
        this.phase = 'prologue';
        this.phaseTimer = 0;
        // Start in the evening at 21:10 (-140 minutes before 23:30)
        this.clockMinutes = -140;
        this.world.setClockTime(-140);

        this.prologueTasks = {
            shopOlivierPack: false,
            shopMeatPack: false,
            shopPaid: false,
            shopDone: false,
            groceriesPlaced: false,
            cookOlivier: false,
            cookMeat: false,
            chickenInOven: false,
            olivierInFridge: false,
            meatInFridge: false,
            boardPicked: false,
            boardInSink: false,
            spongePicked: false,
            kitchenCleaned: false,
            napped: false
        };

        this.act1Tasks = {
            wash: false,
            knockTriggered: false,
            peephole: false,
            tablePicked: false,
            tablePlaced: false,
            tableWings: false,
            tableclothPicked: false,
            table: false,
            stoolPicked: false,
            stool: false,
            garland: false,
            decorBox: false,
            decorHall: false,
            decorKitchen: false,
            decorHallway: false,
            decorate: false,
            decorBoxReturned: false,
            crystal: false,
            pickles: false,
            olivier: false,
            meat: false,
            chicken: false,
            champagne: false,
            watchTv: false,
            pourDrink: false,
            usedToilet: false,
            washedHandsAfterToilet: false
        };

        // Game starts sitting on the sofa watching TV in the evening (21:10)!
        this.phase = 'prologue_tv_sitting';
        this.engine.audioSystem.startSpatialLoop('tv_audio', 'tv_broadcast', this.world.tvGameObject?.transform?.position || new THREE.Vector3(1.58, 0.94, -1.0), { volume: 0.30, tvFilter: true });
        const sp = this.world.playerSpawn || { position: new THREE.Vector3(-2.65, 0.05, -1.0), yaw: -Math.PI / 2, pitch: -0.05 };
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = true;
        this.player.isCrouching = false;
        this.player.eyeHeight = 0.92;
        this.player.targetEyeHeight = 0.92;
        this.player.setPose(sp.position.clone(), sp.yaw, sp.pitch);
        this.player.lookYawCenter = sp.yaw;
        this.player.lookYawLimit = 1.25;
        this.player.lookPitchMin = -0.55;
        this.player.lookPitchMax = 0.45;
        if (this.world.roomLights.hall) this.world.roomLights.hall.setOn(true);
        if (this.world.crtTV) this.world.crtTV.setMode('movie', false);
        if (this.world.wardrobeSponge) this.world.wardrobeSponge.transform.visible = true;
        if (this.world.decorBoxInnerGroup) this.world.decorBoxInnerGroup.visible = true;
        if (this.world.kitchenFaucet) this.world.kitchenFaucet.setOn(false, false);

        this._fadeVal = 0.0;
        this.engine.renderer.setPostProcessParams({ fade: 0.0, wakeVignette: 0.0 });

        const a = this.engine.audioSystem;
        a.startSpatialLoop('tv_audio', 'ogonyok_waltz', new THREE.Vector3(1.58, 0.94, -1.0), {
            volume: 0.42,
            tvFilter: true,
            refDistance: 1.4,
            maxDistance: 14
        });
        a.startSpatialLoop('fridge_hum', 'fridge_hum', new THREE.Vector3(3.75, 0.9, -2.85), {
            volume: 0.30,
            refDistance: 0.9,
            maxDistance: 7.0
        });
        a.startSpatialLoop('clock_tick', 'clock_tick', new THREE.Vector3(2.90, 2.25, -0.71), {
            volume: 0.24,
            refDistance: 0.45,
            maxDistance: 4.8,
            rolloffFactor: 2.6,
            checkOcclusion: true
        });
        a.startSpatialLoop('wind', 'wind_snow', new THREE.Vector3(0.6, 1.4, -5.0), {
            volume: 0.24,
            refDistance: 1.5,
            maxDistance: 16
        });

        this.ui.showGameplayHUD(false);
        this.ui.setClockText('21:10');
        this.ui.setWakePrompt(tr('ui.hud.stand_sofa_tv'), false);
        this.ui.showSubtitle(tr('sub.prologue_tv_start'), 5400);
        this.ui.setObjectives('', []);
    }

    _startClassicAct1FromNap() {
        const w = this.world;
        this.act = 1;
        this.phase = 'act1_wake_sitting';
        this.phaseTimer = 0;
        this.clockMinutes = 0;
        this.world.setClockTime(0);

        // Chicken has finished roasting while napping; Olivier & Meat are chilled in the fridge!
        this._ovenBaking = false;
        if (w.cooking) {
            w.cooking.ovenRawChicken.visible = false;
            w.cooking.bagMesh.visible = false;
            w.cooking.boardGO.transform.visible = false;
            w.cooking.cookedOlivierGO.transform.visible = false;
            w.cooking.cookedMeatGO.transform.visible = false;
            w.cooking.rawChickenGO.transform.visible = false;
            w.cooking.dropHighlight.visible = false;
            w.cooking.cookHighlight.visible = false;
            w.cooking.sinkHighlight.visible = false;
            w.cooking.sofaHighlight.visible = false;
        }
        w.fridgeOlivier.transform.visible = true;
        w.fridgeMeat.transform.visible = true;
        w.ovenChicken.transform.visible = true;
        w.fridge.setOpen(false, false, true);
        w.stove.setOpen(false, false, true);
        if (w.roomLights.hall) w.roomLights.hall.setOn(false);

        // Player wakes up sitting on the sofa facing the TV across the room (classic Act I!)
        const sp = w.playerSpawn || { position: new THREE.Vector3(-2.65, 0.05, -1.0), yaw: -Math.PI / 2, pitch: -0.05 };
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = true;
        this.player.isCrouching = false;
        this.player.eyeHeight = 0.92;
        this.player.targetEyeHeight = 0.92;
        this.player.setPose(sp.position.clone(), sp.yaw, sp.pitch);
        this.player.lookYawCenter = sp.yaw;
        this.player.lookYawLimit = 1.25;
        this.player.lookPitchMin = -0.55;
        this.player.lookPitchMax = 0.45;

        this._fadeVal = 0.0;
        this.engine.renderer.setPostProcessParams({ fade: 0.0, wakeVignette: 1.0 });
        this.ui.showGameplayHUD(true);
        this.ui.setClockText('23:30');
        this.ui.setWakePrompt(tr('ui.hud.wake_prompt'), false);
    }

    loadCheckpoint2345() {
        this._resetWorldForRun(true);
        this.player.eyeHeight = 1.54;
        this.player.targetEyeHeight = 1.54;
        this.player.setPose(new THREE.Vector3(1.0, 0.05, -3.9), 0.12, -0.05);
        this._fadeVal = 1.0;

        const a = this.engine.audioSystem;
        a.startSpatialLoop('tv_audio', 'ogonyok_waltz', new THREE.Vector3(1.58, 0.94, -1.0), {
            volume: 0.12,
            tvFilter: true,
            refDistance: 1.4,
            maxDistance: 14
        });
        a.startSpatialLoop('fridge_hum', 'fridge_hum', new THREE.Vector3(3.75, 0.9, -2.85), {
            volume: 0.45,
            refDistance: 0.9,
            maxDistance: 7.0
        });
        a.startSpatialLoop('clock_tick', 'clock_tick', new THREE.Vector3(2.90, 2.25, -0.71), {
            volume: 0.25,
            refDistance: 0.45,
            maxDistance: 4.8,
            rolloffFactor: 2.6,
            checkOcclusion: true
        });
        a.startSpatialLoop('wind', 'wind_snow', new THREE.Vector3(0.6, 1.4, -5.0), {
            volume: 0.38,
            refDistance: 1.5,
            maxDistance: 16
        });

        this.ui.showGameplayHUD(false);
        this._transitionToAct3();
    }

    _transitionToAct2() {
        this.act = 2;
        this.phase = 'act2_lighting';
        this.phaseTimer = 0;
        this._smokePromptState = '';
        this.clockMinutes = 13;
        this.world.setClockTime(13);
        this.ui.setClockText('23:43');
        this.ui.setObjectives(tr('obj.act2.title'), [{ text: tr('obj.act2.smoke'), done: false }]);
        this.ui.showSubtitle(tr('sub.act2_balcony'), 4200);

        this.player.startBalconySmokeSequence(
            this.world.balconyWindow,
            (state) => {
                this._smokePromptState = state;
            },
            () => {
                this._smokePromptState = '';
                this.phase = 'act2_smoke';
                this.phaseTimer = 0;
                this.player.setCigarette(true);
                this.world.cigSmokeEmitter.setActive(true);
                if (this.world.courtyardStroller) {
                    this.world.courtyardStroller.visible = true;
                    this.world.courtyardStroller.position.set(-14.0, -8.5, -17.5);
                }
            }
        );
    }

    _startAct2ZoomSequence() {
        this.phase = 'act2_zoom';
        this.phaseTimer = 0;
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        this.player.forcedLookTarget = this.world.neighborScene.roomCenter;
        this.player.forcedFov = 25;
        this.monster.startWindowMurder();
    }

    _transitionToAct3() {
        this.act = 3;
        this.phase = 'act3_chase';
        this.phaseTimer = 0;
        if (this.player.isPeephole || this.player._peepholeAnim) {
            this.player.exitPeephole(true);
        }
        this.clockMinutes = 15;
        this.world.setClockTime(15);
        this.ui.setClockText('23:45');

        this.hasCheckpoint = true;
        localStorage.setItem('sng_checkpoint_2345', '1');
        this.ui.setCheckpointAvailable(true);

        const a = this.engine.audioSystem;
        a.startSpatialLoop('horror_darkness', 'horror_darkness', new THREE.Vector3(0, 1, -2), { volume: 0.14, checkOcclusion: false });
        a.startSpatialLoop('heartbeat', 'heartbeat', new THREE.Vector3(0, 1, 0), { volume: 0.28, checkOcclusion: false });
        a.setLoopVolume('tv_audio', 0.12, 0.4);
        a.setLoopVolume('fridge_hum', 0.45, 0.4);
        a.setLoopVolume('clock_tick', 0.26, 0.4);
        a.setLoopVolume('wind', 0.38, 0.4);

        this.monster.startCourtyardSprint();
        this.ui.setObjectives(tr('obj.act3.title'), [
            { text: tr('obj.act3.run_inside'), done: false },
            { text: tr('obj.act3.hide'), done: false },
            { text: tr('obj.act3.close_door'), done: false }
        ]);
        this.ui.showSubtitle(tr('sub.act3_run'), 4500);
        this._assaultStep = 0;
    }

    _transitionToAct4() {
        this.act = 4;
        this.phase = 'act4_inspect';
        this.phaseTimer = 0;
        this.clockMinutes = 27;
        this.world.setClockTime(27);
        this.ui.setClockText('23:57');
        this.act4Inspected = { door: false, table: false, tree: false, tv: false };

        const a = this.engine.audioSystem;
        a.stopLoop('tv_audio');
        a.stopLoop('horror_darkness');
        a.stopLoop('heartbeat');
        a.startSpatialLoop('melancholy', 'melancholy_ambient', new THREE.Vector3(0, 1.5, 0), { volume: 0.35, checkOcclusion: false });

        this.world.setApartmentDestroyedState();
        this.engine.renderer.setPostProcessParams({ panic: 0.0, aberration: 0.0012 });

        this.ui.showSubtitle(tr('sub.act4_start'), 4800);
        this._refreshAct4Objectives();
    }

    _inspectPoint(key, quote) {
        this.act4Inspected[key] = true;
        this.ui.showSubtitle(quote, 4200);
        this._refreshAct4Objectives();
    }

    _triggerTVTwist() {
        this.act4Inspected.tv = true;
        this.phase = 'act4_tv_twist';
        this.phaseTimer = 0;
        this._twistStep = 0;
        this._refreshAct4Objectives();

        const a = this.engine.audioSystem;
        for (const [id, entry] of a.activeLoops.entries()) {
            const quietVol = Math.min(0.03, (entry.baseVolume ?? 0.4) * 0.10);
            a.setLoopVolume(id, quietVol, 0.5);
        }

        const tvPos = new THREE.Vector3(1.58, 0.94, -1.0);
        this._tvLine1 = tr('sub.tv_line1');
        this._tvLine2 = tr('sub.tv_line2');
        this._tvLine3 = tr('sub.tv_line3');

        // Starts pre-recorded retro-processed voiceover (with 0.75s emergency alert tones at start)
        a.speakTVBroadcast('', tvPos);
    }

    _triggerMidnightClimax() {
        this.phase = 'act4_midnight';
        this.phaseTimer = 0;
        this._fadeVal = 1.0;
        this._midnightWalkStepTimer = 0;
        this._midnightStartPos.copy(this.player.transform.position);
        this._act4LookTarget.set(3.08, 1.35, 3.6);
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        this.player.forcedLookSpeed = 2.0;
        this.player.forcedLookTarget = this._act4LookTarget;

        this.clockMinutes = 30;
        this.world.setClockTime(30);
        this.ui.setClockText('00:00');
        this.world.crtTV.setMode('midnight', true);

        this.monster.startMidnightRetreat();

        if (this.world.doors?.balcony && !this.world.doors.balcony.isOpen()) {
            this.world.doors.balcony.setOpen(true);
        }

        const a = this.engine.audioSystem;
        a.setLoopVolume('wind', 0.24, 2.5);
        a.playSpatialOneShot('chimes', new THREE.Vector3(1.58, 0.94, -1.0), { bufferKey: 'chimes', volume: 0.8, checkOcclusion: false });
        a.playSpatialOneShot('fireworks', new THREE.Vector3(0, 4, -14), { bufferKey: 'fireworks', volume: 0.6, maxDistance: 60 });
        this.ui.showSubtitle(tr('sub.midnight_hny'), 4800);
        this.ui.setObjectives('00:00', []);
    }

    _refreshObjectives() {
        // PROLOGUE: Store trip -> Cooking -> Put in fridge -> Wash board -> Nap on sofa
        if (this.act === 0 && this.phase === 'prologue') {
            const p = this.prologueTasks;
            if (!p.shopDone) {
                if (!this._inStore) {
                    this.ui.setObjectives(tr('obj.act1.shop_title'), [
                        { text: tr('obj.act1.go_store'), done: false }
                    ]);
                } else {
                    this.ui.setObjectives(tr('obj.act1.shop_title'), [
                        { text: tr('obj.act1.store_olivier_pack'), done: !!p.shopOlivierPack },
                        { text: tr('obj.act1.store_meat_pack'), done: !!p.shopMeatPack },
                        { text: tr('obj.act1.store_pay'), done: !!p.shopPaid },
                        { text: tr('obj.act1.store_return_home'), done: false }
                    ]);
                }
                return;
            }
            const cookList = [
                { text: tr('obj.act1.unpack_groceries'), done: !!p.groceriesPlaced },
                { text: tr('obj.act1.cook_olivier'), done: !!p.cookOlivier },
                { text: tr('obj.act1.cook_meat'), done: !!p.cookMeat },
                { text: tr('obj.act1.put_chicken_oven'), done: !!p.chickenInOven },
                { text: tr('obj.prologue.store_in_fridge'), done: !!(p.olivierInFridge && p.meatInFridge) },
                {
                    text: !p.boardPicked
                        ? tr('obj.prologue.take_board_wash')
                        : (!p.spongePicked ? tr('obj.prologue.get_sponge') : tr('obj.prologue.wash_board_sink')),
                    done: !!p.kitchenCleaned
                },
                { text: tr('obj.prologue.nap_sofa'), done: !!p.napped }
            ];
            this.ui.setObjectives(tr('obj.prologue.cook_title'), cookList);
            return;
        }

        if (this.act !== 1) return;
        if (this.phase === 'act1_wake_sitting' || this.phase === 'act1_standing_up' || this.phase === 'act1_look_around') {
            this.ui.setObjectives('', []);
            return;
        }
        const t = this.act1Tasks;

        // Step 1: Wash face in bathroom
        if (!t.wash) {
            this.ui.setObjectives(tr('obj.act1.wake_title'), [
                { text: tr('obj.act1.wash'), done: false }
            ]);
            return;
        }

        // Wait for neighbor door knock right after washing
        if (!t.knockTriggered) {
            this.ui.setObjectives(tr('obj.act1.wake_title'), []);
            return;
        }

        // Step 2: Check front door peephole after loud knock
        if (!t.peephole) {
            this.ui.setObjectives(tr('obj.act1.who_title'), [
                { text: tr('obj.act1.peephole'), done: false }
            ]);
            return;
        }

        // Step 3: Classic New Year preparation chores
        const decorDoneCount = (t.decorHall ? 1 : 0) + (t.decorKitchen ? 1 : 0) + (t.decorHallway ? 1 : 0);
        let tableTaskText = tr('obj.act1.table_balcony');
        if (this._tableStage === 'carrying') {
            tableTaskText = tr('obj.act1.table_place');
        } else if (this._tableStage === 'placed_folded') {
            tableTaskText = tr('obj.act1.table_unfold');
        } else if (this._tableStage === 'wing1_open') {
            tableTaskText = tr('obj.act1.table_unfold');
        } else if (this._tableStage === 'unfolded_bare') {
            tableTaskText = t.tableclothPicked
                ? tr('obj.act1.table_spread_cloth')
                : tr('obj.act1.table_get_cloth');
        }

        const list = [
            { text: tableTaskText, done: !!t.table },
            {
                text: t.stoolPicked
                    ? tr('obj.act1.stool_place')
                    : tr('obj.act1.stool_get'),
                done: !!t.stool
            },
            {
                text: t.decorBox
                    ? tr('obj.act1.tree_decorate')
                    : tr('obj.act1.tree_get_box'),
                done: !!t.garland
            },
            {
                text: t.decorBox
                    ? tr('obj.act1.decor_places', { done: decorDoneCount })
                    : tr('obj.act1.decor_get_box', { done: decorDoneCount }),
                done: !!t.decorate
            },
            { text: tr('obj.act1.return_empty_box'), done: !!t.decorBoxReturned },
            { text: tr('obj.act1.crystal'), done: !!t.crystal },
            { text: tr('obj.act1.pickles'), done: !!t.pickles },
            { text: tr('obj.act1.fridge'), done: !!(t.olivier && t.meat) },
            { text: tr('obj.act1.chicken'), done: !!t.chicken }
        ];

        if (this._isIndoorChoresDone()) {
            if (!t.champagne) {
                list.push({ text: tr('obj.act1.champagne'), done: false });
            } else {
                list.push({ text: tr('obj.act1.sit_table'), done: !!(t.watchTv && t.pourDrink) });
                if (t.watchTv && t.pourDrink) {
                    if (!t.usedToilet) {
                        list.push({ text: tr('obj.act1.use_toilet'), done: false });
                    } else {
                        list.push({ text: tr('obj.act1.go_smoke'), done: false });
                    }
                }
            }
        }
        this.ui.setObjectives(tr('obj.act1.prep_title'), list);
    }

    _refreshAct4Objectives() {
        const d = this.act4Inspected;
        this.ui.setObjectives(tr('obj.act4.title'), [
            { text: tr('obj.act4.door'), done: d.door },
            { text: tr('obj.act4.table'), done: d.table },
            { text: tr('obj.act4.tree'), done: d.tree },
            { text: tr('obj.act4.tv'), done: d.tv }
        ]);
    }

    update(deltaTime) {
        if (this.player?.transform?.position && this.world?.updateVisibilityCulling) {
            this.world.updateVisibilityCulling(
                this.player.transform.position,
                this.player.isPeephole || !!this.player._peepholeAnim,
                this._inStore
            );
        }
        if (this.phase === 'menu') {
            this._updateLightsAndClocks(deltaTime);
            return;
        }
        this.phaseTimer += deltaTime;

        if (this._fadeVal < 1.0 &&
            !this._storeTransition &&
            this.phase !== 'prologue_falling_asleep' &&
            this.phase !== 'act1_wake_sitting' &&
            this.phase !== 'act4_midnight' &&
            this.phase !== 'act3_escape_run' &&
            this.phase !== 'ended') {
            this._fadeVal = Math.min(1.0, this._fadeVal + deltaTime * 0.55);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        }

        if (!this._inStore) {
            this.world.crtTV.update(deltaTime);
            if (this.world.neighborWindowCanvas && (this.act === 2 || this.player.transform.position.z < -2.5)) {
                this.world.neighborWindowCanvas.update(deltaTime);
            }
        }
        this._updateLightsAndClocks(deltaTime);
        this._updateFlyingProps(deltaTime);
        this._updatePeeDecals(deltaTime);
        this._updateTableHighlightZones(deltaTime);
        this._updatePromptHUD();

        // Handle dropping any held item (except heavy table / cigarette) with [R]
        if (this.engine.inputManager.wasKeyJustPressed('KeyR') &&
            !this.player.controlsLocked &&
            !this.player.isHidden &&
            !this.player.isPeephole &&
            !this.ui.isDialogueOpen() &&
            this.player.heldItem &&
            this.player.heldItem !== 'table' &&
            this.player.heldItem !== 'cigarette') {
            this._dropHeldItem();
        }

        if (this.act === 0) {
            this._updatePrologue(deltaTime);
        } else if (this.act === 1) {
            this._updateAct1(deltaTime);
        } else if (this.act === 2) {
            this._updateAct2(deltaTime);
        } else if (this.act === 3) {
            this._updateAct3(deltaTime);
        } else if (this.act === 4) {
            this._updateAct4(deltaTime);
        }

        if (this.phase === 'jumpscare_delay' && this.phaseTimer > 1.35) {
            this.phase = 'ended';
            this.engine.audioSystem.stopLoop('horror_darkness');
            this.engine.audioSystem.stopLoop('heartbeat');
            if (this._jumpscareReason === 'trap_ambush') {
                this.ui.showEnding2();
            } else {
                const reasonMsg = this._jumpscareReason === 'noise'
                    ? tr('ui.death.reason.noise')
                    : (this._jumpscareReason === 'door_open'
                        ? tr('ui.death.reason.door_open')
                        : (this._jumpscareReason === 'balcony_broken'
                            ? tr('ui.death.reason.balcony_broken')
                            : tr('ui.death.reason.spotted')));
                this.ui.showDeathScreen(reasonMsg);
            }
        }
    }

    _updateTableHighlightZones(deltaTime) {
        const w = this.world;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
        if (w.tablePlacementZone?.go?.transform.visible) {
            w.tablePlacementZone.fillMat.opacity = 0.12 + pulse * 0.18;
            w.tablePlacementZone.borderMat.opacity = 0.45 + pulse * 0.45;
        }

        // Pulsing golden highlights for apartment decoration spots & Christmas tree
        const showDecorHighlights = this.act === 1 && this.act1Tasks?.decorBox;
        const updateDecorFrame = (frame, shouldShow) => {
            if (!frame) return;
            frame.visible = !!shouldShow;
            if (!shouldShow) return;
            const ud = frame.userData;
            if (ud?.fillMat) ud.fillMat.opacity = 0.10 + pulse * 0.16;
            if (ud?.borderMat) ud.borderMat.opacity = 0.45 + pulse * 0.45;
            if (ud?.diamond) {
                ud.diamond.rotation.y += deltaTime * 2.2;
                const s = 0.85 + pulse * 0.3;
                ud.diamond.scale.set(s, s, s);
            }
        };
        if (w.decorQuest?.highlights) {
            updateDecorFrame(w.decorQuest.highlights.hall, showDecorHighlights && !this.act1Tasks.decorHall);
            updateDecorFrame(w.decorQuest.highlights.kitchen, showDecorHighlights && !this.act1Tasks.decorKitchen);
            updateDecorFrame(w.decorQuest.highlights.hallway, showDecorHighlights && !this.act1Tasks.decorHallway);
        }
        updateDecorFrame(
            w.treeDecorHighlight,
            showDecorHighlights && !this.act1Tasks.garland && !this._treeDecoratingInProgress
        );
        updateDecorFrame(
            w.tableclothHighlight,
            this.act === 1 && this.act1Tasks?.peephole && !this.act1Tasks?.tableclothPicked
        );
        if (w.cooking) {
            const p = this.prologueTasks || {};
            updateDecorFrame(
                w.cooking.dropHighlight,
                this.act === 0 && p.shopDone && !p.groceriesPlaced && this.player.heldItem === 'groceryBag'
            );
            updateDecorFrame(
                w.cooking.cookHighlight,
                this.act === 0 && p.groceriesPlaced && !this._cookingInProgress && (!p.cookOlivier || !p.cookMeat || (p.chickenInOven && p.olivierInFridge && p.meatInFridge && !p.boardPicked))
            );
            updateDecorFrame(
                w.cooking.sinkHighlight,
                this.act === 0 && (p.boardPicked && p.spongePicked) && !p.kitchenCleaned
            );
            updateDecorFrame(
                w.cooking.sofaHighlight,
                this.act === 0 && this.phase === 'prologue' && p.kitchenCleaned && !p.napped
            );
        }
        if (w.store && this._inStore) {
            updateDecorFrame(w.store.olivierPackHighlight, !this.prologueTasks?.shopOlivierPack);
            updateDecorFrame(w.store.meatPackHighlight, !this.prologueTasks?.shopMeatPack);
        }

        // Animate wing unfolding or tablecloth spreading in real time while the player holds KeyE on the table
        if (this.act === 1 && w.table) {
            const inter = this.engine.interactionSystem;
            const isTargetingTable = inter.currentTarget && inter.currentTarget.gameObject === w.table.go;
            const ratio = isTargetingTable ? (inter.getHoldRatio() || 0) : 0;
            if (this._tableStage === 'placed_folded' || this._tableStage === 'wing1_open') {
                const wingIdx = this._tableStage === 'placed_folded' ? 1 : 2;
                w.table.setWingProgress(wingIdx, ratio);
            } else if (this._tableStage === 'unfolded_bare' && this.act1Tasks.tableclothPicked) {
                w.table.setTableclothProgress(ratio);
            }

            // Free table placement preview marker
            if (w.tablePlaceMarker) {
                const showMarker = (
                    this._tableStage === 'unfolded' &&
                    isTargetingTable &&
                    this.player.heldItem &&
                    this._isFoodOrTableItem(this.player.heldItem) &&
                    inter.currentHitPoint
                );
                w.tablePlaceMarker.visible = !!showMarker;
                if (showMarker) {
                    const localPt = w.table.go.transform.worldToLocal(inter.currentHitPoint.clone());
                    w.tablePlaceMarker.position.x = THREE.MathUtils.clamp(localPt.x, -0.58, 0.58);
                    w.tablePlaceMarker.position.z = THREE.MathUtils.clamp(localPt.z, -0.28, 0.28);
                    w.tablePlaceMarker.rotation.z += deltaTime * 2.5;
                }
            }
        } else if (w.tablePlaceMarker) {
            w.tablePlaceMarker.visible = false;
        }
    }

    _stopDoorKnockAndPlayStairRun() {
        if (this._knockTurnedToRun) return;
        this._knockTurnedToRun = true;
        this.engine.audioSystem.stopOneShotsByType?.('door_knock');

        // Rapid receding running footsteps down the concrete stairs outside the front door
        this._stairRunTimers = [];
        const stepCount = 9;
        for (let i = 0; i < stepCount; i++) {
            const delayMs = i * 135;
            const timerId = setTimeout(() => {
                if (this.act !== 1) return;
                const u = i / (stepCount - 1);
                const pos = new THREE.Vector3(
                    THREE.MathUtils.lerp(3.05, 2.48, u),
                    THREE.MathUtils.lerp(0.0, -1.75, u),
                    THREE.MathUtils.lerp(4.78, 8.15, u)
                );
                this.engine.audioSystem.playSpatialOneShot('footstep_concrete', pos, {
                    heavy: true,
                    volume: Math.max(0.18, 0.95 * (1.0 - u * 0.72)),
                    checkOcclusion: false
                });
            }, delayMs);
            this._stairRunTimers.push(timerId);
        }
    }

    _pickupWorldItem(key, go) {
        this._droppedItems.delete(key);
        this._removeFlyingProp(go);
        if (go) {
            go.transform.rotation.set(0, 0, 0);
            go.transform.visible = false;
        }
        this.player.setHeldItem(key);
        this.engine.audioSystem.playSpatialOneShot('pickup', go ? go.transform.position : this.player.transform.position);
    }

    _removeFlyingProp(go) {
        if (!go || !this._flyingProps?.length) return;
        this._flyingProps = this._flyingProps.filter(p => p.go !== go);
    }

    _dropHeldItem() {
        const item = this.player.heldItem;
        if (!item || item === 'table' || item === 'cigarette') return;
        const w = this.world;

        // HL2-style physics throw: launch forward along camera look direction with natural object resting pose
        const cam = this.engine.renderer.camera;
        const origin = new THREE.Vector3();
        cam.getWorldPosition(origin);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
        const startPos = origin.clone().addScaledVector(dir, 0.44);
        startPos.y = Math.max(0.25, startPos.y - 0.14);

        const throwVel = dir.clone().multiplyScalar(4.4);
        throwVel.y += 1.35;

        let targetGO = null;
        let droppedKey = item;
        let floorY = 0.02;
        let restRotX = 0;
        let restRotZ = 0;
        let flightTiltRate = 1.4; // subtle pitch/roll in air instead of spinning like a ball!

        if (item === 'crystal') {
            targetGO = w.sideboardCrystal;
            floorY = 0.0;
            flightTiltRate = 0.6;
        } else if (item === 'pickles') {
            targetGO = w.pantryPickles;
            // Pickles jar origin is centered at mid-height (half-height ~0.088)
            floorY = 0.088;
            flightTiltRate = 0.9;
        } else if (item === 'olivier') {
            targetGO = this.act === 0 ? w.cooking?.cookedOlivierGO : w.fridgeOlivier;
            // Bowl origin is centered at mid-height (half-height ~0.043)
            floorY = 0.044;
            flightTiltRate = 0.65;
        } else if (item === 'meat') {
            targetGO = this.act === 0 ? w.cooking?.cookedMeatGO : w.fridgeMeat;
            floorY = 0.012;
            flightTiltRate = 0.45;
        } else if (item === 'chicken') {
            targetGO = w.ovenChicken;
            // Baking tray base is at y = -0.045 in local space
            floorY = 0.052;
            flightTiltRate = 0.5;
        } else if (item === 'champagne') {
            targetGO = w.champagneBottle;
            // Wine bottle lies naturally on its side on the floor (radius ~0.046)
            floorY = 0.046;
            restRotZ = Math.PI / 2;
            flightTiltRate = 2.2;
        } else if (item === 'stool') {
            this.act1Tasks.stoolPicked = false;
            targetGO = w.kitchenStool;
            // Stool can land either upright on its 4 legs or on its side
            const onSide = Math.random() < 0.45;
            floorY = onSide ? 0.17 : 0.0;
            restRotZ = onSide ? Math.PI / 2 : 0;
            flightTiltRate = 1.6;
        } else if (item === 'tablecloth') {
            this.act1Tasks.tableclothPicked = false;
            targetGO = w.wardrobeTablecloth;
            floorY = 0.0;
            flightTiltRate = 0.55;
        } else if (item === 'decorBox') {
            this.act1Tasks.decorBox = false;
            targetGO = w.decorQuest?.box;
            floorY = 0.0;
            flightTiltRate = 0.75;
        } else if (item === 'rawChicken') {
            targetGO = w.cooking?.rawChickenGO;
            floorY = 0.0;
            flightTiltRate = 0.5;
        } else if (item === 'dirtyBoard') {
            this.prologueTasks.boardPicked = false;
            this.prologueTasks.boardInSink = false;
            targetGO = w.cooking?.boardGO;
            floorY = 0.0;
            flightTiltRate = 0.5;
        } else if (item === 'sponge') {
            this.prologueTasks.spongePicked = false;
            targetGO = w.wardrobeSponge;
            floorY = 0.018;
            flightTiltRate = 1.2;
        } else if ((item === 'shoppingBasket' || item === 'olivierPack' || item === 'meatPack') && this._inStore) {
            if (this.prologueTasks.shopMeatPack) {
                this.prologueTasks.shopMeatPack = false;
                droppedKey = 'meatPack';
                targetGO = w.store?.meatPackGO;
                floorY = 0.0;
            } else if (this.prologueTasks.shopOlivierPack) {
                this.prologueTasks.shopOlivierPack = false;
                droppedKey = 'olivierPack';
                targetGO = w.store?.olivierPackGO;
                floorY = 0.0;
            } else {
                return;
            }
            flightTiltRate = 0.7;
        } else {
            return;
        }

        if (!targetGO) return;

        this._droppedItems.add(droppedKey);
        this._removeFlyingProp(targetGO);
        targetGO.transform.position.copy(startPos);
        targetGO.transform.rotation.set(0, this.player.yaw, 0);
        targetGO.transform.visible = true;

        this._flyingProps.push({
            go: targetGO,
            vel: throwVel,
            yawVel: (Math.random() - 0.5) * 2.4,
            pitchVel: (Math.random() - 0.5) * flightTiltRate,
            rollVel: (Math.random() - 0.5) * flightTiltRate,
            restRotX,
            restRotZ,
            floorY,
            radius: 0.14,
            bounces: 0,
            settled: false
        });

        if (this._inStore && (item === 'shoppingBasket' || item === 'olivierPack' || item === 'meatPack')) {
            this._syncShoppingBasketVisuals();
        } else {
            this.player.setHeldItem(null);
        }
        this.engine.audioSystem.playSpatialOneShot('pickup', startPos, { volume: 0.32 });
        this._refreshObjectives();
    }

    _updateFlyingProps(deltaTime) {
        if (!this._flyingProps?.length) return;
        const dt = Math.min(deltaTime, 0.05);
        const bodies = this.engine.physicsEngine?.rigidBodies || [];
        const propBox = new THREE.Box3();
        const halfVec = new THREE.Vector3();

        for (let i = this._flyingProps.length - 1; i >= 0; i--) {
            const p = this._flyingProps[i];
            if (!p.go || !p.go.transform.visible) {
                this._flyingProps.splice(i, 1);
                continue;
            }
            const pos = p.go.transform.position;
            p.vel.y -= 11.2 * dt;

            const prevPos = pos.clone();
            pos.addScaledVector(p.vel, dt);

            let surfaceSupported = false;

            // Check collisions against static world AABBs (walls, cabinets, tables)
            halfVec.set(p.radius, p.radius, p.radius);
            propBox.setFromCenterAndSize(pos, halfVec.clone().multiplyScalar(2));
            for (let b = 0; b < bodies.length; b++) {
                const rb = bodies[b];
                if (rb.bodyType !== 'static' || !rb.collider || !rb.collider.enabled) continue;
                const box = rb.collider.getBox(rb.position);
                if (propBox.intersectsBox(box)) {
                    const hitX = (prevPos.x + p.radius <= box.min.x + 0.04) || (prevPos.x - p.radius >= box.max.x - 0.04);
                    const hitZ = (prevPos.z + p.radius <= box.min.z + 0.04) || (prevPos.z - p.radius >= box.max.z - 0.04);
                    const hitY = (prevPos.y - p.radius >= box.max.y - 0.08);

                    if (hitY && p.vel.y <= 0) {
                        pos.y = box.max.y + p.floorY;
                        surfaceSupported = true;
                        if (Math.abs(p.vel.y) > 0.85) {
                            const hitVol = Math.min(0.55, Math.abs(p.vel.y) * 0.11);
                            this.engine.audioSystem.playSpatialOneShot('footstep_parquet', pos, { volume: hitVol });
                            if (this.act === 3) {
                                this.monster.notifySoundStimulus(pos, 0.72, 'thrown_item');
                            }
                        }
                        p.vel.y *= -0.22;
                        p.vel.x *= 0.65;
                        p.vel.z *= 0.65;
                        p.yawVel *= 0.45;
                        p.pitchVel *= 0.35;
                        p.rollVel *= 0.35;
                        p.bounces++;
                    } else if (hitX) {
                        pos.x = prevPos.x;
                        p.vel.x *= -0.42;
                        p.vel.z *= 0.78;
                        this.engine.audioSystem.playSpatialOneShot('footstep_parquet', pos, { volume: 0.28 });
                    } else if (hitZ) {
                        pos.z = prevPos.z;
                        p.vel.z *= -0.42;
                        p.vel.x *= 0.78;
                        this.engine.audioSystem.playSpatialOneShot('footstep_parquet', pos, { volume: 0.28 });
                    } else {
                        pos.copy(prevPos);
                        p.vel.multiplyScalar(-0.32);
                    }
                    break;
                }
            }

            // Floor collision & bounce
            if (pos.y <= p.floorY) {
                pos.y = p.floorY;
                surfaceSupported = true;
                if (Math.abs(p.vel.y) > 0.9) {
                    const hitVol = Math.min(0.6, Math.abs(p.vel.y) * 0.11);
                    this.engine.audioSystem.playSpatialOneShot('footstep_parquet', pos, { volume: hitVol });
                    if (this.act === 3) {
                        this.monster.notifySoundStimulus(pos, 0.75, 'thrown_item');
                    }
                    p.vel.y *= -0.24;
                    p.vel.x *= 0.68;
                    p.vel.z *= 0.68;
                    p.yawVel *= 0.45;
                    p.pitchVel *= 0.35;
                    p.rollVel *= 0.35;
                    p.bounces++;
                } else {
                    p.vel.y = 0;
                    p.vel.x *= Math.pow(0.12, dt);
                    p.vel.z *= Math.pow(0.12, dt);
                    p.yawVel *= Math.pow(0.05, dt);
                    p.pitchVel *= Math.pow(0.04, dt);
                    p.rollVel *= Math.pow(0.04, dt);
                }
            }

            const rot = p.go.transform.rotation;
            rot.y += p.yawVel * dt;

            if (surfaceSupported || p.bounces > 0) {
                // Smoothly align pitch (x) and roll (z) to the object's natural resting pose (flat or lying on side)
                const alignRate = Math.min(1, dt * 14.0);
                rot.x = THREE.MathUtils.lerp(rot.x, p.restRotX || 0, alignRate);
                rot.z = THREE.MathUtils.lerp(rot.z, p.restRotZ || 0, alignRate);
            } else {
                // Subtle constrained tilt while airborne — never tumbles end-over-end like a sphere
                rot.x = THREE.MathUtils.lerp(rot.x, (p.restRotX || 0) + p.pitchVel * 0.25, Math.min(1, dt * 6.0));
                rot.z = THREE.MathUtils.lerp(rot.z, (p.restRotZ || 0) + p.rollVel * 0.25, Math.min(1, dt * 6.0));
            }

            if (surfaceSupported && p.vel.lengthSq() < 0.015) {
                rot.x = p.restRotX || 0;
                rot.z = p.restRotZ || 0;
                this._flyingProps.splice(i, 1);
            }
        }
    }

    _ensurePeeCanvasSurfaces() {
        if (this._peeCanvasSurfaces) return this._peeCanvasSurfaces;
        const scene = this.engine.renderer?.scene;
        if (!scene) return null;

        const makeSurface = (key, width, height, resW, resH, pos, rot, fadeAlpha = 0.08) => {
            const canvas = document.createElement('canvas');
            canvas.width = resW;
            canvas.height = resH;
            const ctx = canvas.getContext('2d');
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
            mesh.position.copy(pos);
            mesh.rotation.set(rot.x, rot.y, rot.z);
            mesh.renderOrder = 3;
            mesh.visible = false;
            scene.add(mesh);
            return {
                key,
                canvas,
                ctx,
                tex,
                mat,
                mesh,
                width,
                height,
                resW,
                resH,
                fadeAlpha,
                hasInk: false,
                activeAge: 0
            };
        };

        this._peeCanvasSurfaces = {
            // Bathroom tiled floor around toilet & sink (X: 4.28..5.28, Z: 1.62..3.48)
            floor: makeSurface(
                'floor', 1.00, 1.86, 200, 372,
                new THREE.Vector3(4.78, 0.011, 2.55),
                new THREE.Euler(-Math.PI / 2, 0, 0),
                0.085
            ),
            // Toilet bowl water surface (X: 4.58..4.86, Z: 2.98..3.30)
            bowlWater: makeSurface(
                'bowlWater', 0.26, 0.30, 96, 112,
                new THREE.Vector3(4.72, 0.273, 3.14),
                new THREE.Euler(-Math.PI / 2, 0, 0),
                0.11
            ),
            // Toilet ceramic rim plane (X: 4.52..4.92, Z: 2.92..3.36)
            bowlRim: makeSurface(
                'bowlRim', 0.38, 0.42, 112, 124,
                new THREE.Vector3(4.72, 0.402, 3.14),
                new THREE.Euler(-Math.PI / 2, 0, 0),
                0.095
            ),
            // Toilet cistern tank front (X: 4.53..4.91, Y: 0.52..0.88 at Z = 3.296)
            tankFront: makeSurface(
                'tankFront', 0.38, 0.36, 96, 96,
                new THREE.Vector3(4.72, 0.70, 3.296),
                new THREE.Euler(0, Math.PI, 0),
                0.10
            ),
            // South wall behind toilet (X: 4.28..5.28, Y: 0.02..1.52 at Z = 3.396)
            wallSouth: makeSurface(
                'wallSouth', 1.00, 1.50, 200, 300,
                new THREE.Vector3(4.78, 0.77, 3.396),
                new THREE.Euler(0, Math.PI, 0),
                0.09
            ),
            // West wall (X = 4.304, Z: 1.62..3.48, Y: 0.02..1.52)
            wallWest: makeSurface(
                'wallWest', 1.86, 1.50, 340, 280,
                new THREE.Vector3(4.304, 0.77, 2.55),
                new THREE.Euler(0, Math.PI / 2, 0),
                0.09
            ),
            // East partition / bathtub side (X = 5.202, Z: 1.62..3.48, Y: 0.02..1.52)
            wallEast: makeSurface(
                'wallEast', 1.86, 1.50, 340, 280,
                new THREE.Vector3(5.202, 0.77, 2.55),
                new THREE.Euler(0, -Math.PI / 2, 0),
                0.09
            )
        };
        return this._peeCanvasSurfaces;
    }

    _paintPeeOnSurface(surfaceKey, u, v, isWater = false) {
        const surfaces = this._ensurePeeCanvasSurfaces();
        if (!surfaces || !surfaces[surfaceKey]) return;
        const s = surfaces[surfaceKey];
        const cu = THREE.MathUtils.clamp(u, 0.02, 0.98);
        const cv = THREE.MathUtils.clamp(v, 0.02, 0.98);
        const px = cu * s.resW;
        const py = (1.0 - cv) * s.resH;
        const r = isWater ? (10 + Math.random() * 5) : (9 + Math.random() * 5);

        const ctx = s.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createRadialGradient(px, py, 0.5, px, py, r);
        if (isWater) {
            // Smooth warm golden cloud diffusing into toilet bowl water (Fears to Fathom style)
            g.addColorStop(0.0, 'rgba(235, 172, 32, 0.24)');
            g.addColorStop(0.55, 'rgba(228, 158, 24, 0.12)');
            g.addColorStop(1.0, 'rgba(220, 145, 18, 0.0)');
        } else {
            // Smooth continuous organic liquid stream trail on floor / porcelain / wall
            g.addColorStop(0.0, 'rgba(232, 160, 22, 0.28)');
            g.addColorStop(0.50, 'rgba(225, 148, 18, 0.15)');
            g.addColorStop(0.82, 'rgba(216, 134, 14, 0.05)');
            g.addColorStop(1.0, 'rgba(210, 126, 10, 0.0)');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        s.hasInk = true;
        s.activeAge = 0;
        s.mesh.visible = true;
        s.tex.needsUpdate = true;
    }

    _updatePeeDecals(deltaTime) {
        if (!this._peeCanvasSurfaces) return;
        this._peeFadeTick = (this._peeFadeTick || 0) + deltaTime;
        if (this._peeFadeTick < 0.075) return;
        const stepDt = this._peeFadeTick;
        this._peeFadeTick = 0;

        for (const s of Object.values(this._peeCanvasSurfaces)) {
            if (!s.hasInk) continue;
            s.activeAge += stepDt;
            // Start gradually fading right away so trails smoothly evaporate and vanish like in F2F
            const eraseAlpha = Math.min(0.25, s.fadeAlpha * stepDt * (this._peeState ? 0.85 : 1.45));
            const ctx = s.ctx;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = `rgba(0, 0, 0, ${eraseAlpha.toFixed(4)})`;
            ctx.fillRect(0, 0, s.resW, s.resH);
            ctx.restore();
            s.tex.needsUpdate = true;

            if (!this._peeState && s.activeAge > 9.5) {
                ctx.clearRect(0, 0, s.resW, s.resH);
                s.tex.needsUpdate = true;
                s.hasInk = false;
                s.mesh.visible = false;
            }
        }
    }

    _startToiletPeeSequence() {
        const scene = this.engine.renderer.scene;
        this.phase = 'act1_peeing';
        this.phaseTimer = 0;
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = true;
        this.player.isCrouching = false;
        this.player.eyeHeight = 1.54;
        this.player.targetEyeHeight = 1.54;
        // Stand in front of the toilet (toilet is at 4.72, 0, 3.18) facing +Z (yaw = PI) with generous camera freedom
        this.player.setPose(new THREE.Vector3(4.68, 0.05, 2.56), Math.PI, -0.46);
        this.player.lookYawCenter = Math.PI;
        this.player.lookYawLimit = 1.65;
        this.player.lookPitchMin = -1.28;
        this.player.lookPitchMax = 0.68;

        // Build stream droplet segments + continuous stream line (warm golden-amber tint)
        const streamMat = new THREE.MeshBasicMaterial({
            color: 0xeeb834,
            transparent: true,
            opacity: 0.78
        });
        const streamGeo = new THREE.SphereGeometry(0.015, 6, 5);
        const streamMeshes = [];
        const segCount = 24;
        for (let i = 0; i < segCount; i++) {
            const m = new THREE.Mesh(streamGeo, streamMat);
            scene.add(m);
            streamMeshes.push(m);
        }

        const linePositions = new Float32Array((segCount + 1) * 3);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        const streamLine = new THREE.Line(
            lineGeo,
            new THREE.LineBasicMaterial({ color: 0xf2c444, transparent: true, opacity: 0.76 })
        );
        streamLine.frustumCulled = false;
        scene.add(streamLine);

        this._peeState = {
            duration: 15.0,
            elapsed: 0,
            decalCooldown: 0,
            soundTimer: 0,
            streamMeshes,
            streamLine,
            linePositions
        };

        this.engine.audioSystem.playSpatialOneShot('steam_hiss', new THREE.Vector3(4.72, 0.35, 3.14), { volume: 0.38 });
        this.ui.showSubtitle(tr('sub.toilet_peeing_hint'), 5500);
    }

    _updateToiletPeeSequence(deltaTime) {
        const st = this._peeState;
        if (!st) return;
        const scene = this.engine.renderer.scene;
        st.elapsed += deltaTime;
        const progress = Math.min(1, st.elapsed / st.duration);
        this.ui.setHoldProgress(progress);

        st.soundTimer += deltaTime;
        if (st.soundTimer >= 1.65 && st.elapsed < st.duration - 0.5) {
            st.soundTimer = 0;
            this.engine.audioSystem.playSpatialOneShot('steam_hiss', new THREE.Vector3(4.72, 0.35, 3.14), { volume: 0.28 });
        }

        // Compute parabolic urine stream from hip along player's aim direction (can be aimed higher!)
        const p = this.player.transform.position;
        const origin = new THREE.Vector3(p.x, 0.90, p.z);
        const yaw = this.player.yaw;
        const pitch = this.player.pitch;
        const dir = new THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch) * 0.92 + 0.08,
            -Math.cos(yaw) * Math.cos(pitch)
        ).normalize();

        const speed = 2.45;
        const g = -7.2;
        let hitPos = null;
        let hitNormal = new THREE.Vector3(0, 1, 0);
        let hitInBowlWater = false;

        const bowlCenterX = 4.72;
        const bowlCenterZ = 3.14;

        st.linePositions[0] = origin.x;
        st.linePositions[1] = origin.y;
        st.linePositions[2] = origin.z;
        let lastX = origin.x, lastY = origin.y, lastZ = origin.z;

        for (let i = 0; i < st.streamMeshes.length; i++) {
            const m = st.streamMeshes[i];
            if (hitPos) {
                m.visible = false;
                st.linePositions[(i + 1) * 3] = lastX;
                st.linePositions[(i + 1) * 3 + 1] = lastY;
                st.linePositions[(i + 1) * 3 + 2] = lastZ;
                continue;
            }
            const t = (i + 1) * 0.028;
            const sx = origin.x + dir.x * speed * t;
            const sy = origin.y + dir.y * speed * t + 0.5 * g * t * t;
            const sz = origin.z + dir.z * speed * t;

            // Check bathroom walls / toilet tank / toilet bowl / floor
            const dBowl = Math.hypot(sx - bowlCenterX, sz - bowlCenterZ);
            if (sz >= 3.29 && Math.abs(sx - 4.72) <= 0.19 && sy >= 0.42 && sy <= 0.89) {
                // Toilet cistern tank front
                hitPos = new THREE.Vector3(sx, sy, 3.295);
                hitNormal.set(0, 0, -1);
            } else if (dBowl < 0.13 && sy <= 0.34) {
                hitPos = new THREE.Vector3(sx, 0.275, sz);
                hitNormal.set(0, 1, 0);
                hitInBowlWater = true;
            } else if (dBowl < 0.22 && sy <= 0.405 && sy >= 0.31) {
                // Toilet rim
                hitPos = new THREE.Vector3(sx, 0.402, sz);
                hitNormal.set(0, 1, 0);
            } else if (sx <= 4.31) {
                hitPos = new THREE.Vector3(4.305, Math.max(0.03, sy), sz);
                hitNormal.set(1, 0, 0);
            } else if (sx >= 5.21) {
                hitPos = new THREE.Vector3(5.20, Math.max(0.03, sy), sz);
                hitNormal.set(-1, 0, 0);
            } else if (sz >= 3.40) {
                hitPos = new THREE.Vector3(sx, Math.max(0.03, sy), 3.395);
                hitNormal.set(0, 0, -1);
            } else if (sz <= 1.62) {
                hitPos = new THREE.Vector3(sx, Math.max(0.03, sy), 1.625);
                hitNormal.set(0, 0, 1);
            } else if (sy <= 0.015) {
                hitPos = new THREE.Vector3(sx, 0.012, sz);
                hitNormal.set(0, 1, 0);
            }

            m.visible = true;
            const jitter = Math.sin(st.elapsed * 34 + i * 1.7) * 0.004;
            const px = hitPos ? hitPos.x : (sx + jitter);
            const py = hitPos ? hitPos.y : Math.max(0.015, sy);
            const pz = hitPos ? hitPos.z : (sz + jitter);
            m.position.set(px, py, pz);
            lastX = px;
            lastY = py;
            lastZ = pz;
            st.linePositions[(i + 1) * 3] = px;
            st.linePositions[(i + 1) * 3 + 1] = py;
            st.linePositions[(i + 1) * 3 + 2] = pz;
        }
        st.streamLine.geometry.attributes.position.needsUpdate = true;

        // Fears to Fathom style continuous dynamic canvas puddle & trail painting (no sprite discs!)
        st.decalCooldown -= deltaTime;
        if (hitPos && st.decalCooldown <= 0) {
            st.decalCooldown = 0.025;
            if (hitInBowlWater) {
                const u = (hitPos.x - (4.72 - 0.13)) / 0.26;
                const v = 1.0 - (hitPos.z - (3.14 - 0.15)) / 0.30;
                this._paintPeeOnSurface('bowlWater', u, v, true);
            } else if (Math.abs(hitPos.y - 0.402) < 0.03) {
                const u = (hitPos.x - (4.72 - 0.19)) / 0.38;
                const v = 1.0 - (hitPos.z - (3.14 - 0.21)) / 0.42;
                this._paintPeeOnSurface('bowlRim', u, v, false);
            } else if (Math.abs(hitPos.z - 3.295) < 0.02 && hitPos.y > 0.41) {
                const u = 1.0 - (hitPos.x - (4.72 - 0.19)) / 0.38;
                const v = (hitPos.y - 0.52) / 0.36;
                this._paintPeeOnSurface('tankFront', u, v, false);
            } else if (Math.abs(hitNormal.y) > 0.5) {
                const u = (hitPos.x - (4.78 - 0.50)) / 1.00;
                const v = 1.0 - (hitPos.z - (2.55 - 0.93)) / 1.86;
                this._paintPeeOnSurface('floor', u, v, false);
            } else if (hitNormal.z < -0.5) {
                const u = 1.0 - (hitPos.x - (4.78 - 0.50)) / 1.00;
                const v = (hitPos.y - 0.02) / 1.50;
                this._paintPeeOnSurface('wallSouth', u, v, false);
            } else if (hitNormal.x > 0.5) {
                const u = 1.0 - (hitPos.z - (2.55 - 0.93)) / 1.86;
                const v = (hitPos.y - 0.02) / 1.50;
                this._paintPeeOnSurface('wallWest', u, v, false);
            } else if (hitNormal.x < -0.5) {
                const u = (hitPos.z - (2.55 - 0.93)) / 1.86;
                const v = (hitPos.y - 0.02) / 1.50;
                this._paintPeeOnSurface('wallEast', u, v, false);
            }
        }

        if (st.elapsed >= st.duration) {
            for (const m of st.streamMeshes) {
                scene.remove(m);
            }
            if (st.streamLine) {
                scene.remove(st.streamLine);
            }
            this._peeState = null;
            this.ui.setHoldProgress(0);
            this.player.controlsLocked = false;
            this.player.allowLookWhileLocked = false;
            this.player.lookYawCenter = null;
            this.act1Tasks.usedToilet = true;
            this.phase = 'act1';
            this.engine.audioSystem.playSpatialOneShot('steam_hiss', new THREE.Vector3(4.72, 0.45, 3.18), { volume: 0.42 });
            this.ui.showSubtitle(tr('sub.toilet_done_smoke'), 4600);
            this._refreshObjectives();
        }
    }

    _updatePrologue(deltaTime) {
        const input = this.engine.inputManager;

        // 0. Prologue start: sitting on the sofa watching TV programs (can switch channels with E, stand up with Space)
        if (this.phase === 'prologue_tv_sitting') {
            if (input.wasKeyJustPressed('KeyE') && this.world.crtTV) {
                const ch = this.world.crtTV.nextChannel();
                this.engine.audioSystem.playSpatialOneShot('pickup', this.world.tvGameObject.transform.position, { volume: 0.45 });
                this.ui.showSubtitle(tr(`sub.tv_channel_${ch}`), 2800);
            }
            if (this.phaseTimer >= 2.2) {
                this.ui.setWakePrompt(tr('ui.hud.stand_sofa_tv'), true);
            }
            if (this.phaseTimer >= 1.4 && input.wasKeyJustPressed('Space')) {
                this.ui.setWakePrompt('', false);
                this.player.controlsLocked = false;
                this.player.allowLookWhileLocked = false;
                this.player.lookYawCenter = null;
                this.player.eyeHeight = 1.54;
                this.player.targetEyeHeight = 1.54;
                const sp = this.world.playerSpawn || { position: new THREE.Vector3(-2.65, 0.05, -1.0), yaw: -Math.PI / 2 };
                this.player.setPose(new THREE.Vector3(sp.position.x + 0.55, 0.05, sp.position.z), sp.yaw, 0);
                this.engine.audioSystem.playSpatialOneShot('wood_creak', this.player.transform.position, { volume: 0.45 });
                this.phase = 'prologue';
                this.phaseTimer = 0;
                this.ui.showSubtitle(tr('sub.prologue_start'), 5200);
                this._refreshObjectives();
            }
            return;
        }

        // Falling asleep on the sofa -> fade to black -> wake up at 23:30 in classic Act I!
        if (this.phase === 'prologue_falling_asleep') {
            const dur = 3.1;
            const u = Math.min(1, this.phaseTimer / dur);
            const ease = u * u * (3 - 2 * u);
            this._fadeVal = Math.max(0, 1.0 - ease);
            this.engine.renderer.setPostProcessParams({
                fade: this._fadeVal,
                wakeVignette: ease
            });
            if (u >= 1.0) {
                this._startClassicAct1FromNap();
            }
            return;
        }

        // Cinematic departure to the grocery store (hand opens front door -> walk to stairs -> descend steps + slow fade ->
        // teleport to ground-floor entrance vestibule -> heavy iron door creaks open -> walk outside to «Продукты 24»)
        if (this._storeTransition) {
            const trState = this._storeTransition;
            trState.timer += deltaTime;

            if (trState.target === 'store') {
                const t = trState.timer;
                const a = this.engine.audioSystem;
                const fd = this.world.frontDoor?.go;
                const hand = this.player._peepholeHand;
                const smooth = (x) => {
                    const c = Math.max(0, Math.min(1, x));
                    return c * c * (3 - 2 * c);
                };

                // Stage 1 (0.0s .. 1.05s): Reach hand to front door handle and swing door open
                if (t < 1.05) {
                    const u = smooth(t / 1.05);
                    const px = THREE.MathUtils.lerp(trState.startPos.x, 3.08, Math.min(1, u * 1.4));
                    const pz = THREE.MathUtils.lerp(trState.startPos.z, 3.92, Math.min(1, u * 1.4));
                    this.player.transform.position.set(px, 0.05, pz);
                    if (this.player.rb) this.player.rb.position.set(px, 0.05, pz);
                    trState.lookTarget.set(3.08, 1.32, 4.85);

                    if (hand) {
                        hand.visible = true;
                        const reach = Math.sin(Math.min(1, t / 0.95) * Math.PI);
                        hand.position.set(
                            THREE.MathUtils.lerp(0.24, 0.06, reach),
                            THREE.MathUtils.lerp(-0.34, -0.10, reach),
                            THREE.MathUtils.lerp(-0.26, -0.52, reach)
                        );
                        hand.rotation.set(0.18 * reach, -0.15 * reach, 0.12 * reach);
                    }

                    if (t >= 0.28) {
                        if (!trState.doorSoundPlayed) {
                            trState.doorSoundPlayed = true;
                            a.playSpatialOneShot('door_open', new THREE.Vector3(3.08, 1.1, 4.5), { volume: 0.65 });
                        }
                        const openU = smooth((t - 0.28) / 0.72);
                        const ang = openU * 1.38;
                        if (fd) {
                            fd.transform.position.set(3.55 - Math.cos(ang) * 0.475, 1.075, 4.5 + Math.sin(ang) * 0.475);
                            fd.transform.rotation.y = ang;
                        }
                    }
                    return;
                }

                if (hand) hand.visible = false;

                // Stage 2 (1.05s .. 2.35s): Walk out into the 3rd-floor stairwell and turn toward the descending stairs
                if (t < 2.35) {
                    const u = smooth((t - 1.05) / 1.30);
                    let px, pz;
                    if (u < 0.55) {
                        const lu = u / 0.55;
                        px = THREE.MathUtils.lerp(3.08, 3.00, lu);
                        pz = THREE.MathUtils.lerp(3.92, 5.45, lu);
                        trState.lookTarget.lerp(new THREE.Vector3(2.65, 1.05, 7.2), Math.min(1, deltaTime * 5));
                    } else {
                        const lu = (u - 0.55) / 0.45;
                        px = THREE.MathUtils.lerp(3.00, 2.52, lu);
                        pz = THREE.MathUtils.lerp(5.45, 6.22, lu);
                        trState.lookTarget.lerp(new THREE.Vector3(2.52, -0.65, 8.6), Math.min(1, deltaTime * 5));
                    }
                    this.player.transform.position.set(px, 0.05, pz);
                    if (this.player.rb) this.player.rb.position.set(px, 0.05, pz);
                    this.player.cinematicBobOffset = Math.sin(t * 10.5) * 0.032;
                    this.player.cinematicRollOffset = Math.sin(t * 5.2) * 0.018;

                    trState.stepTimer -= deltaTime;
                    if (trState.stepTimer <= 0) {
                        trState.stepTimer = 0.36;
                        a.playSpatialOneShot('footstep_concrete', this.player.transform.position, { volume: 0.45 });
                    }
                    return;
                }

                // Stage 3 (2.35s .. 4.15s): Descend several concrete steps while the screen slowly fades to black
                if (t < 4.15) {
                    const u = Math.min(1, (t - 2.35) / 1.80);
                    const px = 2.52;
                    const py = THREE.MathUtils.lerp(0.05, -1.35, u) + Math.abs(Math.sin(u * Math.PI * 7)) * 0.045;
                    const pz = THREE.MathUtils.lerp(6.22, 7.95, u);
                    this.player.transform.position.set(px, py, pz);
                    if (this.player.rb) this.player.rb.position.set(px, py, pz);
                    trState.lookTarget.lerp(new THREE.Vector3(2.55, -1.9, 9.6), Math.min(1, deltaTime * 4.5));
                    this.player.cinematicBobOffset = Math.sin(t * 11.5) * 0.035;
                    this.player.cinematicRollOffset = Math.sin(t * 6.0) * 0.022;

                    trState.stepTimer -= deltaTime;
                    if (trState.stepTimer <= 0 && t < 3.95) {
                        trState.stepTimer = 0.28;
                        a.playSpatialOneShot('footstep_concrete', this.player.transform.position, { volume: 0.48 });
                    }

                    // Slow fade to black during the descent
                    if (t >= 2.55) {
                        this._fadeVal = Math.max(0, 1.0 - (t - 2.55) / 1.50);
                        this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
                    }
                    return;
                }

                // Stage 4 (4.15s .. 6.15s): Teleport to Ground-Floor Entrance Vestibule (1st floor) & creak open iron door
                if (!trState.switched) {
                    trState.switched = true;
                    // Restore apartment front door cleanly before switching zones
                    if (fd) {
                        fd.transform.position.set(3.075, 1.075, 4.5);
                        fd.transform.rotation.set(0, 0, 0);
                    }
                    if (this.world.frontDoor?.collider) this.world.frontDoor.collider.enabled = true;
                    this.player.cinematicBobOffset = 0;
                    this.player.cinematicRollOffset = 0;
                    this.player.forcedLookTarget = null;

                    this._inStore = true;
                    this.clockMinutes = -128; // ~21:22 stepping out of the building
                    this.world.setClockTime(-128);
                    this.ui.setClockText('21:22');
                    this.world.store.resetStreetDoors?.();
                    a.startSpatialLoop('street_music', 'winter_street_music', null, { volume: 0.26, checkOcclusion: false });
                    const sp = this.world.store.streetSpawnPos || this.world.store.spawnPos;
                    this.player.setPose(sp, this.world.store.streetSpawnYaw ?? 0, -0.04);
                    if (this.player.rb) this.player.rb.useGravity = true;
                    if (this.player.collider) this.player.collider.enabled = true;
                    this._refreshObjectives();
                }

                // Keep store zone doors animating during the vestibule fade-in!
                this.world.store?.updateNPCs?.(deltaTime, this.player.transform.position, null);

                const ft = t - 4.15;
                this._fadeVal = Math.min(1.0, ft / 0.85);
                this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });

                // Heavy rusted iron entrance door creaks open to reveal the snowy street & «Продукты 24»
                if (ft >= 0.45 && !trState.ironCreakPlayed) {
                    trState.ironCreakPlayed = true;
                    this.world.store.setIronDoorOpen?.(true);
                    this.ui.showSubtitle(tr('sub.street_exit_podiezd'), 4600);
                }

                if (ft >= 1.55) {
                    this._fadeVal = 1.0;
                    this.engine.renderer.setPostProcessParams({ fade: 1.0 });
                    this._storeTransition = null;
                    this.player.controlsLocked = false;
                }
                return;
            }

            // Return home:
            // 1. Immediately animate climbing forward up the ground-floor podiezd stairs while fading out
            // 2. Fade in on the 3rd-floor stairs & climb up to Apartment #34
            // 3. Open front door & walk inside
            // 4. Turn around toward the door
            // 5. Close front door behind player
            // 6. Turn back toward the hallway & unlock controls
            const t = trState.timer;
            const a = this.engine.audioSystem;
            const fd = this.world.frontDoor?.go;
            const smooth = (x) => {
                const c = Math.max(0, Math.min(1, x));
                return c * c * (3 - 2 * c);
            };

            if (t < 1.35) {
                if (!trState.groundClimbInit) {
                    trState.groundClimbInit = true;
                    trState.startPos = this.player.transform.position.clone();
                    this.player.forcedLookTarget = trState.lookTarget;
                    this.player.forcedLookSpeed = 7.0;
                }
                const u = smooth(t / 1.35);
                const sp = trState.startPos;
                const px = THREE.MathUtils.lerp(sp.x, 94.85, u);
                const py = sp.y + u * 0.95 + Math.abs(Math.sin(u * Math.PI * 4)) * 0.035;
                const pz = sp.z + u * 1.45;
                this.player.transform.position.set(px, py, pz);
                if (this.player.rb) this.player.rb.position.set(px, py, pz);
                // Face forward (+Z) up the ground-floor stairs
                trState.lookTarget.set(94.85, py + 1.55, pz + 2.8);
                this.player.cinematicBobOffset = Math.sin(t * 11.0) * 0.028;

                this._fadeVal = Math.max(0, 1.0 - Math.max(0, (t - 0.25) / 1.05));
                this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
                trState.stepTimer -= deltaTime;
                if (trState.stepTimer <= 0 && t < 1.15) {
                    trState.stepTimer = 0.30;
                    a.playSpatialOneShot('footstep_concrete', this.player.transform.position, { volume: 0.45 });
                }
                return;
            }

            if (!trState.switched) {
                trState.switched = true;
                this._inStore = false;
                this.prologueTasks.shopDone = true;
                this.clockMinutes = -110; // ~21:40
                this.world.setClockTime(-110);
                this.ui.setClockText('21:40');
                this.world.store.resetStreetDoors?.();
                a.stopSpatialLoop('street_music');
                // Place player on the 3rd-floor stairs facing forward (-Z) up toward Apartment #34
                this.player.setPose(new THREE.Vector3(2.55, -0.78, 7.15), 0.14, 0.14);
                trState.lookTarget.set(3.075, 1.32, 4.4);
                this.player.forcedLookTarget = trState.lookTarget;
                this.player.forcedLookSpeed = 6.0;
                this._refreshObjectives();
            }

            const rt = t - 1.35;
            this._fadeVal = Math.min(1.0, rt / 0.70);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });

            if (rt < 1.40) {
                // Phase 2: Climb the last steps onto the 3rd-floor landing
                const u = smooth(rt / 1.40);
                const px = THREE.MathUtils.lerp(2.55, 3.05, u);
                const py = THREE.MathUtils.lerp(-0.78, 0.05, u) + Math.abs(Math.sin(u * Math.PI * 4)) * 0.04;
                const pz = THREE.MathUtils.lerp(7.15, 5.25, u);
                this.player.transform.position.set(px, py, pz);
                if (this.player.rb) this.player.rb.position.set(px, py, pz);
                trState.lookTarget.set(3.075, 1.32, 4.4);
                this.player.cinematicBobOffset = Math.sin(rt * 11.0) * 0.03;
                trState.stepTimer -= deltaTime;
                if (trState.stepTimer <= 0) {
                    trState.stepTimer = 0.30;
                    a.playSpatialOneShot('footstep_concrete', this.player.transform.position, { volume: 0.44 });
                }
            } else if (rt < 2.75) {
                // Phase 3: Open front door & step inside Apartment #34
                const u = smooth((rt - 1.40) / 1.35);
                if (!trState.doorOpened) {
                    trState.doorOpened = true;
                    a.playSpatialOneShot('door_open', new THREE.Vector3(3.08, 1.1, 4.5), { volume: 0.62 });
                }
                const ang = Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5) * 1.35;
                if (fd) {
                    fd.transform.position.set(3.55 - Math.cos(ang) * 0.475, 1.075, 4.5 + Math.sin(ang) * 0.475);
                    fd.transform.rotation.y = ang;
                }
                const px = THREE.MathUtils.lerp(3.05, 3.08, u);
                const pz = THREE.MathUtils.lerp(5.25, 3.65, u);
                this.player.transform.position.set(px, 0.05, pz);
                if (this.player.rb) this.player.rb.position.set(px, 0.05, pz);
                trState.lookTarget.set(3.08, 1.38, 1.5);
                this.player.cinematicBobOffset = Math.sin(rt * 9.5) * 0.025;
            } else if (rt < 3.45) {
                // Phase 4: Turn around to face the open front door
                const u = smooth((rt - 2.75) / 0.70);
                this.player.cinematicBobOffset = 0;
                const turnAng = u * Math.PI; // 0 (-Z hallway) -> PI (+Z door)
                trState.lookTarget.set(3.08 + Math.sin(turnAng) * 1.8, 1.35, 3.65 - Math.cos(turnAng) * 1.8);
            } else if (rt < 4.15) {
                // Phase 5: Close the front door behind player
                const u = smooth((rt - 3.45) / 0.70);
                const ang = (1.0 - u) * 1.35;
                if (fd) {
                    fd.transform.position.set(3.55 - Math.cos(ang) * 0.475, 1.075, 4.5 + Math.sin(ang) * 0.475);
                    fd.transform.rotation.y = ang;
                }
                if (!trState.doorClosed && u >= 0.85) {
                    trState.doorClosed = true;
                    a.playSpatialOneShot('door_close', new THREE.Vector3(3.08, 1.1, 4.5), { volume: 0.65 });
                }
                trState.lookTarget.set(3.08, 1.32, 4.65);
            } else if (rt < 4.85) {
                // Phase 6: Turn back toward the hallway
                const u = smooth((rt - 4.15) / 0.70);
                const turnAng = Math.PI + u * Math.PI; // PI (+Z door) -> 2*PI (-Z hallway)
                trState.lookTarget.set(3.08 + Math.sin(turnAng) * 1.8, 1.38, 3.65 - Math.cos(turnAng) * 1.8);
            } else {
                // Restore front door closed behind player & unlock controls facing hallway
                if (fd) {
                    fd.transform.position.set(3.075, 1.075, 4.5);
                    fd.transform.rotation.set(0, 0, 0);
                }
                if (this.world.frontDoor?.collider) this.world.frontDoor.collider.enabled = true;
                this.player.cinematicBobOffset = 0;
                this.player.forcedLookTarget = null;
                this.player.setPose(new THREE.Vector3(3.08, 0.05, 3.65), 0, 0);
                if (this.player.rb) this.player.rb.useGravity = true;
                if (this.player.collider) this.player.collider.enabled = true;
                this._fadeVal = 1.0;
                this.engine.renderer.setPostProcessParams({ fade: 1.0 });
                this._storeTransition = null;
                this.player.controlsLocked = false;
                this.ui.showSubtitle(tr('sub.store_returned_home'), 4800);
            }
            return;
        }

        // Keep Store NPCs, traffic & street pedestrians animated when in the store/city zone
        if (this._inStore && this.world.store?.updateNPCs) {
            this.world.store.updateNPCs(deltaTime, this.player.transform.position, this._activeNpcId);
            // If player bought groceries and walked back up the stairs inside their Podiezd, smoothly return to 3rd floor!
            if (this.prologueTasks.shopPaid && this.world.store.isOnPodiezdReturnStairs?.(this.player.transform.position)) {
                this._exitGroceryStore();
            }
            return;
        }

        // Oven glow while chicken is slowly baking during prologue
        if (this._ovenBaking && this.world.lights?.ovenLight && !this.world.powerOut) {
            this._ovenBakeTimer += deltaTime;
            this.world.lights.ovenLight.intensity = 1.15 + Math.sin(this._ovenBakeTimer * 6.0) * 0.15;
        }
    }

    _updateAct1(deltaTime) {
        const input = this.engine.inputManager;

        // 1. Waking up sitting on the sofa (no UI except blinking Space prompt)
        if (this.phase === 'act1_wake_sitting') {
            const t = this.phaseTimer;
            // Realistic waking eye blink curve
            let wakeVig = 0.0;
            let fade = 1.0;
            if (t < 1.1) {
                const u = t / 1.1;
                fade = u;
                wakeVig = 1.0 - u * 0.55;
            } else if (t < 1.65) {
                // Brief drowsy blink
                const u = (t - 1.1) / 0.55;
                wakeVig = 0.45 + Math.sin(u * Math.PI) * 0.42;
            } else if (t < 3.4) {
                const u = (t - 1.65) / 1.75;
                wakeVig = 0.45 * (1.0 - u * u);
            } else {
                wakeVig = 0.0;
            }
            this._fadeVal = fade;
            this.engine.renderer.setPostProcessParams({ fade, wakeVignette: wakeVig });

            if (t >= 2.1) {
                this.ui.setWakePrompt(tr('ui.hud.wake_prompt'), true);
            }
            if (t >= 1.5 && input.wasKeyJustPressed('Space')) {
                this.phase = 'act1_standing_up';
                this.phaseTimer = 0;
                this._standStepPlayed = false;
                this.ui.setWakePrompt('', false);
                this.engine.renderer.setPostProcessParams({ fade: 1.0, wakeVignette: 0.0 });
                this.engine.audioSystem.playSpatialOneShot('wood_creak', this.player.transform.position, { volume: 0.45 });
            }
            return;
        }

        // 2. Slow animation of standing up from the sofa
        if (this.phase === 'act1_standing_up') {
            const dur = 2.75;
            const u = Math.min(1.0, this.phaseTimer / dur);
            const ease = u * u * (3.0 - 2.0 * u);

            // Lean forward slightly then rise to full standing height
            const sp = this.world.playerSpawn || { position: new THREE.Vector3(-2.65, 0.05, -1.0), yaw: -Math.PI / 2 };
            const fwdX = -Math.sin(sp.yaw) * 0.52;
            const fwdZ = -Math.cos(sp.yaw) * 0.52;
            const px = THREE.MathUtils.lerp(sp.position.x, sp.position.x + fwdX, ease);
            const pz = THREE.MathUtils.lerp(sp.position.z, sp.position.z + fwdZ, ease);
            this.player.transform.position.set(px, sp.position.y, pz);
            if (this.player.rb) this.player.rb.position.set(px, sp.position.y, pz);

            if (u < 0.38) {
                const lu = u / 0.38;
                this.player.eyeHeight = THREE.MathUtils.lerp(0.92, 1.02, lu);
                this.player.targetEyeHeight = this.player.eyeHeight;
                this.player.cinematicBobOffset = -Math.sin(lu * Math.PI) * 0.06;
                this.player.cinematicRollOffset = Math.sin(lu * Math.PI) * 0.035;
            } else {
                const lu = (u - 0.38) / 0.62;
                const rEase = lu * lu * (3 - 2 * lu);
                this.player.eyeHeight = THREE.MathUtils.lerp(1.02, 1.54, rEase);
                this.player.targetEyeHeight = this.player.eyeHeight;
                this.player.cinematicBobOffset = Math.sin(lu * Math.PI) * 0.025;
                this.player.cinematicRollOffset = (1.0 - rEase) * 0.02;
                if (!this._standStepPlayed && lu > 0.35) {
                    this._standStepPlayed = true;
                    this.engine.audioSystem.playSpatialOneShot('footstep_parquet', this.player.transform.position, { volume: 0.35 });
                }
            }

            if (u >= 1.0) {
                this.player.eyeHeight = 1.54;
                this.player.targetEyeHeight = 1.54;
                this.player.cinematicBobOffset = 0;
                this.player.cinematicRollOffset = 0;
                this.player.controlsLocked = false;
                this.player.allowLookWhileLocked = false;
                this.player.lookYawCenter = null;

                // Reveal HUD & show first objective/thought only AFTER standing up, with a timer to look around
                this.ui.setCleanIntroMode(false);
                this.phase = 'act1_look_around';
                this.phaseTimer = 0;
                this.ui.showSubtitle(tr('sub.wake_1'), 4800);
            }
            return;
        }

        // 3. Look-around timer (6.5s) before displaying the first objective
        if (this.phase === 'act1_look_around') {
            if (this.phaseTimer >= 6.5) {
                this.phase = 'act1';
                this.phaseTimer = 0;
                this.ui.showSubtitle(tr('sub.wake_2'), 4400);
                this._refreshObjectives();
            }
            return;
        }

        // 4. Sitting at the table on the stool, drinking champagne & watching TV before going out to smoke
        if (this.phase === 'act1_sitting_table') {
            if (this._tableDinnerStep === 0) {
                if (input.wasKeyJustPressed('KeyE')) {
                    this._tableDinnerStep = 1;
                    this._tableDinnerTimer = 0;
                    this.act1Tasks.pourDrink = true;
                    this.player.setHeldItem('crystal');
                    this.engine.audioSystem.playSpatialOneShot('pickup', this.player.transform.position, { volume: 0.5 });
                    this.ui.showSubtitle(tr('sub.dinner_toast'), 4200);
                    this.ui.setObjectives(tr('obj.act1.dinner_title'), [
                        { text: tr('obj.act1.listen_tv'), done: false }
                    ]);
                }
            } else if (this._tableDinnerStep === 1) {
                this._tableDinnerTimer += deltaTime;
                // Gentle sip & eating animation while watching TV
                if (this._tableDinnerTimer > 1.2 && this._tableDinnerTimer < 3.6) {
                    this.player.cinematicBobOffset = Math.sin((this._tableDinnerTimer - 1.2) * 2.5) * 0.025;
                } else {
                    this.player.cinematicBobOffset = 0;
                }

                if (this._tableDinnerTimer >= 4.2 && !this._dinnerTvQuoteShown) {
                    this._dinnerTvQuoteShown = true;
                    this.player.setHeldItem(null);
                    this.engine.audioSystem.playSpatialOneShot('pickup', this.world.table.hallPos, { volume: 0.35 });
                    this.ui.showSubtitle(tr('sub.dinner_tv_speech'), 5000);
                }
                if (this._tableDinnerTimer >= 9.4 && !this._dinnerSmokeQuoteShown) {
                    this._dinnerSmokeQuoteShown = true;
                    this.act1Tasks.watchTv = true;
                    this.ui.showSubtitle(tr('sub.dinner_need_toilet'), 4600);
                    this.ui.setWakePrompt(tr('ui.hud.wake_table_prompt'), true);
                    this.ui.setObjectives(tr('obj.act1.prep_title'), [
                        { text: tr('obj.act1.use_toilet'), done: false }
                    ]);
                }
                if (this._tableDinnerTimer >= 9.4 && (input.wasKeyJustPressed('Space') || input.wasKeyJustPressed('KeyE') || input.wasKeyJustPressed('KeyQ'))) {
                    this._dinnerTvQuoteShown = false;
                    this._dinnerSmokeQuoteShown = false;
                    this.ui.setWakePrompt('', false);
                    this.player.controlsLocked = false;
                    this.player.allowLookWhileLocked = false;
                    this.player.lookYawCenter = null;
                    this.player.targetEyeHeight = 1.54;
                    this.player.eyeHeight = 1.54;
                    this.player.cinematicBobOffset = 0;
                    const stoolPos = this.world.placedHallStool
                        ? this.world.placedHallStool.transform.position
                        : new THREE.Vector3(-1.35, 0, -1.96);
                    this.player.setPose(new THREE.Vector3(stoolPos.x, 0.05, stoolPos.z - 0.32), this.player.yaw, 0);
                    this.engine.audioSystem.playSpatialOneShot('footstep_parquet', this.player.transform.position, { volume: 0.4 });
                    this.phase = 'act1';
                    this._refreshObjectives();
                }
            }
            return;
        }

        // 4b. Post-dinner 15-second interactive toilet sequence
        if (this.phase === 'act1_peeing') {
            this._updateToiletPeeSequence(deltaTime);
            return;
        }

        // 5. Trigger loud neighbor door knock after washing face and stepping out of the bathroom,
        // and immediately switch knocking to rapid receding footsteps when the player aims at the front door!
        if (this.act1Tasks.wash && !this.act1Tasks.knockTriggered) {
            const p = this.player.transform.position;
            const elapsedSinceWash = this.phaseTimer - this._washFinishTime;
            if (p.x < 4.35 || elapsedSinceWash > 2.4) {
                this.act1Tasks.knockTriggered = true;
                this._knockRepeatTimer = 0;
                this.engine.audioSystem.playSpatialOneShot('door_knock', new THREE.Vector3(3.075, 1.45, 4.55), {
                    bufferKey: 'door_knock',
                    volume: 1.2
                });
                this.ui.showSubtitle(tr('sub.door_knock'), 4200);
                this._refreshObjectives();
            }
        } else if (this.act1Tasks.knockTriggered && !this._knockTurnedToRun && !this.act1Tasks.peephole) {
            const focusedGO = this.engine.interactionSystem?.currentTarget?.gameObject;
            if (focusedGO && focusedGO === this.world.frontDoor?.go) {
                this._stopDoorKnockAndPlayStairRun();
                this.ui.showSubtitle(tr('sub.door_run'), 3800);
            } else {
                this._knockRepeatTimer = (this._knockRepeatTimer || 0) + deltaTime;
                if (this._knockRepeatTimer >= 2.2) {
                    this._knockRepeatTimer = 0;
                    this.engine.audioSystem.playSpatialOneShot('door_knock', new THREE.Vector3(3.075, 1.45, 4.55), {
                        bufferKey: 'door_knock',
                        volume: 1.15
                    });
                }
            }
        }

        const doneCount = Object.values(this.act1Tasks).filter(Boolean).length;
        const targetMins = Math.min(12, Math.floor((doneCount / 16) * 12));
        if (targetMins > this.clockMinutes) {
            this.clockMinutes = targetMins;
            this.world.setClockTime(this.clockMinutes);
            this.ui.setClockText(`23:${30 + this.clockMinutes}`);
        }

        // Phantom watcher eyes in House #14 window when player steps onto or looks from the balcony during Act I
        if (this.world.neighborWindowCanvas && this.world.neighborWindowCanvas.mode === 'dark') {
            const p = this.player.transform.position;
            const onBalcony = p.z < -3.35;
            if (onBalcony && this.act1Tasks.tablePicked) {
                this._balconyWatcherTimer += deltaTime;
                const showEyes = this._balconyWatcherTimer > 0.6 && this._balconyWatcherTimer < 3.4;
                this.world.neighborWindowCanvas.setWatcherEyes?.(showEyes);
            } else {
                this.world.neighborWindowCanvas.setWatcherEyes?.(false);
            }
        }

        if (this._isIndoorChoresDone() && this.act1Tasks.champagne && this.act1Tasks.watchTv && this.act1Tasks.pourDrink && this.act1Tasks.usedToilet) {
            const p = this.player.transform.position;
            if (p.z < -3.65 && p.x > -2.1 && p.x < 2.1) {
                this._transitionToAct2();
            }
        }
    }

    _updateLightsAndClocks(deltaTime) {
        if (this.world.updateDoors) {
            this.world.updateDoors(deltaTime);
        }
        if (this.world.updateClocks) {
            this.world.updateClocks(deltaTime);
        }
        this.world.kitchenFaucet?.update?.(deltaTime);
        this.world.bathroomFaucet?.update?.(deltaTime);
        const t = performance.now() * 0.001;
        const w = this.world;

        const huntFlicker = (this.act === 3 && (this.monster.state === 'patrol' || this.monster.state === 'moving_to_trap' || this.monster.state === 'chase'));
        if (w.garlandOn) {
            w.garlandBulbs.forEach(b => {
                const on = huntFlicker ? (Math.random() > 0.45) : (Math.sin(t * b.freq + b.phase) > -0.2);
                b.mat.color.setHex(on ? b.baseColor : 0x1a1a1a);
            });
            w.garlandLights.forEach((l, idx) => {
                l.intensity = huntFlicker
                    ? Math.random() * 1.1
                    : (idx === 2
                        ? 0.42 + Math.sin(t * 2.1) * 0.14
                        : 0.6 + ((idx % 2 === 0) ? Math.sin(t * 2.5) : Math.cos(t * 3.1)) * 0.25);
            });
        } else {
            w.garlandBulbs.forEach(b => b.mat.color.setHex(0x161616));
            w.garlandLights.forEach(l => { l.intensity = 0; });
        }

        if (huntFlicker) {
            if (w.roomLights.hall && w.roomLights.hall.isOn()) {
                w.roomLights.hall.setOn(false);
            }
            w.lights.kitchenLight.intensity = Math.random() > 0.3 ? 1.15 : 0.05;
            w.lights.hallwayLight.intensity = Math.random() > 0.35 ? 0.95 : 0.02;
            if (w.lights.bathroomLight) {
                w.lights.bathroomLight.intensity = Math.random() > 0.32 ? 0.85 : 0.04;
            }
        }
    }

    _updatePromptHUD() {
        if (this.phase === 'prologue_tv_sitting') {
            this.ui.setPrompt(tr('prompt.tv_switch_channel'), 0);
            return;
        }
        if (this.phase === 'act1_peeing' || this.phase === 'act1_wake_sitting' || this.phase === 'act1_standing_up' || this.phase === 'prologue_falling_asleep' || this.ui.isDialogueOpen() || this._storeTransition || this._cookingInProgress) {
            this.ui.setPrompt('', 0);
            return;
        }
        if (this.phase === 'act2_lighting') {
            if (this._smokePromptState === 'ignite') {
                this.ui.setPrompt(tr('prompt.lighter_ignite'), 0);
            } else if (this._smokePromptState === 'lighting') {
                this.ui.setPrompt(tr('prompt.lighter_hold'), 0);
            } else {
                this.ui.setPrompt('', 0);
            }
            return;
        }
        if (this.phase === 'act1_sitting_table') {
            if (this._tableDinnerStep === 0) {
                this.ui.setPrompt(tr('prompt.pour_champagne'), 0);
            } else {
                this.ui.setPrompt('', 0);
            }
            return;
        }
        if (this.player._peepholeAnim) {
            this.ui.setPrompt('', 0);
            return;
        }
        if (this.player.isPeephole) {
            this.ui.setPrompt(tr('prompt.peephole_exit'), 0);
        } else if (this.player.isHidden && this.player.currentHidingSpot) {
            const spot = this.player.currentHidingSpot;
            this.ui.setPrompt(spot.getDoorPrompt(), 0);
        } else if (this.act === 2 && this.phase === 'act2_smoke' && this.player.cigaretteActive && !this.engine.interactionSystem.currentPrompt) {
            this.ui.setPrompt(tr('prompt.smoke_puff'), 0);
        } else {
            const basePrompt = this.engine.interactionSystem.currentPrompt;
            const holdRatio = this.engine.interactionSystem.getHoldRatio?.() || 0;
            this.ui.setPrompt(basePrompt, holdRatio);
        }
    }

    _updateAct2(deltaTime) {
        if (this.phase === 'act2_smoke') {
            const stroller = this.world.courtyardStroller;
            if (stroller && stroller.visible) {
                stroller.position.x = Math.min(14.0, stroller.position.x + deltaTime * 1.65);
                stroller.position.y = -8.5 + Math.abs(Math.sin(this.phaseTimer * 7.0)) * 0.04;
                const limbs = stroller.userData?.limbs;
                if (limbs) {
                    const swing = Math.sin(this.phaseTimer * 7.0) * 0.55;
                    limbs.leftLeg.rotation.z = swing;
                    limbs.rightLeg.rotation.z = -swing;
                    limbs.leftArm.rotation.z = -swing * 0.65;
                    limbs.rightArm.rotation.z = swing * 0.65;
                }
            }
            if (this.player.cigBurn >= 0.48 && this.phaseTimer >= 3.5) {
                this.phase = 'act2_window_lit';
                this.phaseTimer = 0;
                if (stroller) stroller.visible = false;
                this.engine.audioSystem.playSpatialOneShot('door_pound', new THREE.Vector3(-1.0, -5.5, -18.0), { volume: 0.8, maxDistance: 50 });
                this.world.lights.neighborLight.intensity = 5.2;
                if (this.world.neighborWindowCanvas) this.world.neighborWindowCanvas.setMode('lit_idle');
                this.world.neighborScene.gazeTrigger.enabled = true;
                this.ui.showSubtitle(tr('sub.act2_light_on'), 3800);
                this.ui.setObjectives(tr('obj.act2.title'), [{ text: tr('obj.act2.look_window'), done: false }]);
            }
        } else if (this.phase === 'act2_window_lit' && this.phaseTimer > 4.8) {
            this._startAct2ZoomSequence();
        } else if (this.phase === 'act2_zoom') {
            if (this.phaseTimer > 1.65 && !this._screamPlayed) {
                this._screamPlayed = true;
                this.engine.audioSystem.playSpatialOneShot('jumpscare', this.world.neighborScene.windowPos, {
                    volume: 0.42,
                    maxDistance: 50
                });
            }
            if (this.phaseTimer > 2.65 && this.monster.state !== 'window_stare') {
                this.monster.triggerWindowStare();
                this.engine.renderer.triggerGlitch(0.85);
                this.ui.showSubtitle(tr('sub.act2_seen'), 3200);
            }
            if (this.phaseTimer > 4.9) {
                this._screamPlayed = false;
                this.player.controlsLocked = false;
                this.player.allowLookWhileLocked = false;
                this.player.forcedLookTarget = null;
                this.player.forcedFov = null;
                this.player.setCigarette(false);
                this.world.cigSmokeEmitter.setActive(false);
                this._transitionToAct3();
            }
        }
    }

    _updateAct3(deltaTime) {
        if (this.phase === 'act3_escape_run') {
            this._updateEscapeRoadCinematic(deltaTime);
            return;
        }
        const a = this.engine.audioSystem;
        const mDist = this.monster.transform.position.distanceTo(this.player.transform.position);
        const isHoldingBreath = this.engine.inputManager.isKeyDown('Space');
        const noise = a.updateStealthNoise(
            deltaTime,
            this.engine.inputManager.getMouseDelta(),
            this.player.isHidden,
            isHoldingBreath,
            mDist
        );

        this.ui.updateStealthHUD(true, noise, a.oxygen, a.micEnabled, this.player.isHidden);

        if (this.monster.state === 'assault') {
            const balcBonus = this.world.doors.balcony.isOpen() ? 0.0 : 3.5;
            if (this._assaultStep === 0) {
                this._assaultStep = 1;
                this.phaseTimer = 0;
                this.ui.showSubtitle(tr('sub.act3_stairs'), 3500);
            }
            if (this._assaultStep === 1) {
                const stepInterval = 0.28;
                if (Math.floor((this.phaseTimer - deltaTime) / stepInterval) < Math.floor(this.phaseTimer / stepInterval)) {
                    a.playSpatialOneShot('footstep_concrete', new THREE.Vector3(3.2, -1.5 + this.phaseTimer * 0.4, 5.2), {
                        heavy: true,
                        volume: 1.15,
                        refDistance: 3.0
                    });
                }
                if (this.phaseTimer > 3.2 + balcBonus) {
                    this._assaultStep = 2;
                    this.phaseTimer = 0;
                    a.playSpatialOneShot('sniff', new THREE.Vector3(3.075, 1.3, 4.7), { volume: 1.15, refDistance: 2.8 });
                    this.ui.showSubtitle(tr('sub.act3_sniff'), 3400);
                }
            } else if (this._assaultStep === 2 && this.phaseTimer > 2.4) {
                this._assaultStep = 3;
                this.phaseTimer = 0;
                a.playSpatialOneShot('doorbell_soviet', new THREE.Vector3(3.075, 1.8, 4.5), {
                    bufferKey: 'doorbell',
                    volume: 1.05
                });
                this.ui.showSubtitle(tr('sub.act3_doorbell'), 2800);
            } else if (this._assaultStep === 3 && this.phaseTimer > 2.6) {
                this._assaultStep = 4;
                this.phaseTimer = 0;
                a.playSpatialOneShot('door_pound', new THREE.Vector3(3.075, 1.2, 4.5), {
                    bufferKey: 'door_bang',
                    volume: 1.2
                });
                this.engine.renderer.triggerGlitch(0.7);
            } else if (this._assaultStep === 4 && this.phaseTimer > 1.3) {
                this._assaultStep = 5;
                this.phaseTimer = 0;
                a.playSpatialOneShot('door_pound', new THREE.Vector3(3.075, 1.2, 4.5), { bufferKey: 'door_bang', volume: 1.25 });
                this.engine.renderer.triggerGlitch(0.95);
            } else if (this._assaultStep === 5 && this.phaseTimer > 1.1) {
                this._assaultStep = 6;
                a.playSpatialOneShot('door_crash', new THREE.Vector3(3.075, 1.0, 4.3), { volume: 1.25 });
                this.engine.renderer.triggerGlitch(1.4);
                const dp = this.world.destroyedPoses?.frontDoor;
                if (dp) {
                    this.world.frontDoor.go.transform.position.copy(dp.position);
                    this.world.frontDoor.go.transform.rotation.copy(dp.rotation);
                } else {
                    this.world.frontDoor.go.transform.position.set(3.05, 0.08, 3.35);
                    this.world.frontDoor.go.transform.rotation.set(Math.PI / 2, 0, 0.12);
                }
                this.world.frontDoor.collider.enabled = false;
                if (this.world.roomLights.hall) this.world.roomLights.hall.setOn(false);
                this.world.powerOut = true;
                this.world.garlandOn = false;
                if (this.world.lights.fridgeLight) this.world.lights.fridgeLight.intensity = 0;
                if (this.world.lights.ovenLight) this.world.lights.ovenLight.intensity = 0;
                if (this.world.steamEmitter) this.world.steamEmitter.setActive(false);
                a.stopLoop('fridge_hum');

                this.world.crtTV.setMode('static', false);
                a.startSpatialLoop('tv_audio', 'tv_static', new THREE.Vector3(1.58, 0.94, -1.0), { volume: 0.24, tvFilter: true });

                this.monster.enterApartmentPatrol();
                this.ui.setObjectives(tr('obj.act3.title'), [
                    { text: tr('obj.act3.stay_quiet'), done: false }
                ]);
            }
        }

        if (this.monster.state === 'patrol' || this.monster.state === 'investigate' || this.monster.state === 'inspect_hiding' || this.monster.state === 'moving_to_trap' || this.monster.state === 'trap') {
            const p = this.player.transform.position;
            if (!this._endingTriggered && this._assaultStep >= 6 && !this.player.isHidden && p.z > 4.65 && p.x > 2.2 && p.x < 4.1) {
                this._startEscapeRoadCinematic();
                return;
            }

            if (!this._endingTriggered && this.monster.state === 'patrol' && p.z < -3.65 && !this.world.doors.balcony.isOpen()) {
                if (this.monster._balconyState === 'sniffing' && !this._balconySniffQuote) {
                    this._balconySniffQuote = true;
                    this.ui.showSubtitle(tr('sub.act3_balcony_seen'), 2600);
                } else if (this.monster._balconyState === 'pounding' && !this._balconyPoundQuote) {
                    this._balconyPoundQuote = true;
                    this.ui.showSubtitle(tr('sub.act3_balcony_pound'), 2800);
                }
            }

            // Environmental horror distractions during the hunt:
            // 1. Sudden loud alarm/telephone ring on the sideboard in the living room
            if (!this._act3DistractionDone && this.monster.state === 'patrol' && this.monster.stateTimer > 11.5) {
                this._act3DistractionDone = true;
                const bellPos = new THREE.Vector3(-0.35, 0.95, 1.15);
                a.playSpatialOneShot('phone_ring', bellPos, { volume: 0.95, refDistance: 2.8, maxDistance: 24 });
                this.monster.notifySoundStimulus(bellPos, 0.65, 'alarm');
                this.ui.showSubtitle(tr('sub.act3_alarm_ring'), 3600);
            }
            // 2. Eerie kettle steam whistle in the kitchen
            if (!this._act3KettleDone && this.monster.state === 'patrol' && this.monster.stateTimer > 22.0) {
                this._act3KettleDone = true;
                const kettlePos = new THREE.Vector3(3.85, 0.95, -2.25);
                a.playSpatialOneShot('kettle_whistle', kettlePos, { volume: 0.85, refDistance: 2.5, maxDistance: 22 });
                this.monster.notifySoundStimulus(kettlePos, 0.6, 'kettle');
            }

            // Claustrophobia & low-oxygen auditory hallucinations while holding breath
            if (this.player.isHidden && a.oxygen < 0.38) {
                const hypoxia = (0.38 - a.oxygen) / 0.38;
                this.engine.renderer.setPostProcessParams({
                    wakeVignette: hypoxia * 0.65
                });
                this._lowOxygenWhisperTimer -= deltaTime;
                if (this._lowOxygenWhisperTimer <= 0) {
                    this._lowOxygenWhisperTimer = 2.4;
                    const sideOffset = (Math.random() < 0.5 ? -1 : 1) * 0.65;
                    a.playSpatialOneShot('whisper_cue', new THREE.Vector3(p.x + sideOffset, 1.2, p.z), {
                        volume: 0.35 + hypoxia * 0.35,
                        checkOcclusion: false
                    });
                }
            } else if (this.player.isHidden) {
                this.engine.renderer.setPostProcessParams({ wakeVignette: 0.0 });
            }

            // Tiered noise detection:
            // When monster is actively inspecting the player's hiding spot, any slight noise (> 0.26) is lethal!
            const isInspectingPlayerSpot = (
                this.monster.state === 'inspect_hiding' &&
                this.player.isHidden &&
                this.player.currentHidingSpot?.id === this.monster._inspectSpotCfg?.id &&
                this.monster._inspectPhase === 'stare'
            );
            const lethalThreshold = isInspectingPlayerSpot ? 0.28 : 0.58;
            const investigateThreshold = 0.32;

            if (noise > lethalThreshold) {
                this._noiseSustain += deltaTime;
                if (this._noiseSustain > (isInspectingPlayerSpot ? 0.12 : 0.25)) {
                    this.monster.startChasePlayer('noise');
                }
            } else if (noise > investigateThreshold && this.monster.state === 'patrol') {
                this._noiseSustain += deltaTime * 0.6;
                if (this._noiseSustain > 0.22) {
                    this._noiseSustain = 0;
                    this.monster.notifySoundStimulus(p, noise, 'noise');
                }
            } else {
                this._noiseSustain = Math.max(0, this._noiseSustain - deltaTime * 2);
            }
        }

        if (this.monster.state === 'trap' && !this._trapCueShown) {
            this._trapCueShown = true;
            this.clockMinutes = 26;
            this.world.setClockTime(26);
            this.ui.setClockText('23:56');
            a.setLoopVolume('horror_darkness', 0.04, 1.5);
            a.setLoopVolume('heartbeat', 0.0, 1.0);
            this.engine.renderer.setPostProcessParams({ panic: 0.05, aberration: 0.0012 });
            this.ui.showSubtitle(tr('sub.act3_trap_quiet'), 4200);
        } else if (this.monster.state !== 'trap') {
            this._trapCueShown = false;
        }
    }

    _startEscapeRoadCinematic() {
        this._endingTriggered = true;
        this.stopAllAudioLoops();
        this.phase = 'act3_escape_run';
        this.phaseTimer = 0;
        this._escapeDoorSlammed = false;
        this._escapePlacedInCourtyard = false;
        this._escapeStepTimer = 0;
        this._escapeFireworkTimer = 0;
        this._escapeStartPos = this.player.transform.position.clone();
        this._escapeLookTarget = new THREE.Vector3(2.52, -0.5, 7.2);
        this.ui.updateStealthHUD(false, 0, 1, false, false);
        this.ui.setObjectives(tr('obj.escape.title'), []);
        this.player.controlsLocked = true;
        this.player.allowLookWhileLocked = false;
        this.player.setHeldItem(null);
        if (this.player.rb) {
            this.player.rb.useGravity = false;
            this.player.rb.velocity.set(0, 0, 0);
        }
        if (this.player.collider) this.player.collider.enabled = false;
        this.player.forcedLookSpeed = 4.2;
        this.player.forcedLookTarget = this._escapeLookTarget;

        const a = this.engine.audioSystem;
        a.playSpatialOneShot('monster_roar', new THREE.Vector3(1.5, 1.2, 0.5), { volume: 0.85, maxDistance: 30 });
        a.playSpatialOneShot('footstep_concrete', new THREE.Vector3(3.1, 0, 5.0), { volume: 0.9 });
        this.ui.showSubtitle(tr('sub.escape_stairs'), 3400);
    }

    _updateEscapeRoadCinematic(deltaTime) {
        const t = this.phaseTimer;
        const a = this.engine.audioSystem;

        // Phase 1 (0.0s .. 3.1s): Sprinting through stairwell landing & down the stairs in 3D
        if (t < 3.1) {
            const u = Math.min(1, t / 2.85);
            // Smooth 3-segment path: doorway (3.08,0,4.7) -> top of stairs (2.55,0,6.15) -> bottom landing (2.55,-1.95,8.75)
            let px, py, pz;
            if (u < 0.28) {
                const lu = u / 0.28;
                px = THREE.MathUtils.lerp(this._escapeStartPos.x, 2.55, lu);
                py = 0.0;
                pz = THREE.MathUtils.lerp(this._escapeStartPos.z, 6.15, lu);
                this._escapeLookTarget.lerp(new THREE.Vector3(2.52, -0.8, 8.5), Math.min(1, deltaTime * 6));
                this.player.cinematicRollOffset = THREE.MathUtils.lerp(this.player.cinematicRollOffset, 0.06, Math.min(1, deltaTime * 6));
            } else {
                const lu = (u - 0.28) / 0.72;
                px = 2.55 + Math.sin(lu * Math.PI) * 0.12;
                py = THREE.MathUtils.lerp(0.0, -1.92, lu);
                pz = THREE.MathUtils.lerp(6.15, 8.85, lu);
                // Step bounce going down stairs
                const stairBounce = Math.abs(Math.sin(lu * Math.PI * 9)) * 0.065;
                py += stairBounce;
                this._escapeLookTarget.lerp(new THREE.Vector3(3.1, -2.1, 10.2), Math.min(1, deltaTime * 5));
                this.player.cinematicRollOffset = Math.sin(t * 9.0) * 0.045;
            }
            this.player.transform.position.set(px, py, pz);
            if (this.player.rb) this.player.rb.position.set(px, py, pz);
            this.player.cinematicBobOffset = Math.sin(t * 14.0) * 0.045;

            this._escapeStepTimer -= deltaTime;
            if (this._escapeStepTimer <= 0) {
                this._escapeStepTimer = 0.21;
                a.playSpatialOneShot('footstep_concrete', this.player.transform.position, { heavy: true, volume: 0.72 });
            }

            if (t >= 2.65) {
                this._fadeVal = Math.max(0, 1.0 - (t - 2.65) / 0.42);
                this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
            }
            return;
        }

        // Phase 2: Burst out of the building entrance into the snowy courtyard
        if (!this._escapePlacedInCourtyard) {
            this._escapePlacedInCourtyard = true;
            this.player.transform.position.set(3.1, -8.38, -5.4);
            if (this.player.rb) this.player.rb.position.set(3.1, -8.38, -5.4);
            this._escapeLookTarget.set(2.0, -6.2, -18.0);
            this.player.forcedLookSpeed = 3.2;
            a.playSpatialOneShot('door_crash', new THREE.Vector3(3.1, -7.5, -4.2), { volume: 0.85 });
            a.playSpatialOneShot('chimes', new THREE.Vector3(0, 4, -14), { bufferKey: 'chimes', volume: 0.65, checkOcclusion: false });
            a.playSpatialOneShot('fireworks', new THREE.Vector3(-8, 4, -16), { bufferKey: 'fireworks', volume: 0.8, maxDistance: 80 });
            this.ui.showSubtitle(tr('sub.escape_yard'), 4000);
        }

        const ct = t - 3.1;
        const totalCourtyardDur = 7.2;
        if (ct < 0.5) {
            this._fadeVal = Math.min(1.0, ct / 0.45);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        } else if (ct >= totalCourtyardDur - 1.8) {
            this._fadeVal = Math.max(0, 1.0 - (ct - (totalCourtyardDur - 1.8)) / 1.75);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        }

        // Smooth curved sprint path: from porch (3.1, -5.4) along walkway to road (2.4, -14.8), then curving left down road to (-22.0, -15.2)
        const u = Math.min(1, ct / totalCourtyardDur);
        const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        let nx, nz;
        if (u < 0.36) {
            const lu = u / 0.36;
            const sm = lu * lu * (3 - 2 * lu);
            nx = THREE.MathUtils.lerp(3.1, 1.8, sm * sm);
            nz = THREE.MathUtils.lerp(-5.4, -14.8, lu);
            // Glance briefly up toward the shattered 3rd floor window of House 14, then down the road
            const lookTarget = lu < 0.55
                ? new THREE.Vector3(-1.0, 0.5, -24.5)
                : new THREE.Vector3(-12.0, -4.5, -15.5);
            this._escapeLookTarget.lerp(lookTarget, Math.min(1, deltaTime * 3.0));
            this.player.cinematicRollOffset = THREE.MathUtils.lerp(this.player.cinematicRollOffset, -0.05 * sm, Math.min(1, deltaTime * 5));
        } else {
            const lu = (u - 0.36) / 0.64;
            nx = THREE.MathUtils.lerp(1.8, -23.5, lu);
            nz = -15.2 + Math.sin(lu * Math.PI * 2.5) * 0.22;
            const skySwayY = -2.2 + Math.sin(ct * 1.1) * 1.4;
            this._escapeLookTarget.lerp(new THREE.Vector3(nx - 14.0, skySwayY, -16.5), Math.min(1, deltaTime * 3.2));
            this.player.cinematicRollOffset = Math.sin(ct * 5.5) * 0.032;
        }

        this.player.transform.position.set(nx, -8.38, nz);
        if (this.player.rb) this.player.rb.position.set(nx, -8.38, nz);
        this.player.cinematicBobOffset = Math.sin(ct * 11.5) * 0.052;

        this._escapeStepTimer -= deltaTime;
        if (this._escapeStepTimer <= 0 && ct < totalCourtyardDur - 0.5) {
            this._escapeStepTimer = 0.27;
            a.playSpatialOneShot('footstep_snow', this.player.transform.position, { volume: 0.48 });
        }

        this._escapeFireworkTimer -= deltaTime;
        if (this._escapeFireworkTimer <= 0) {
            this._escapeFireworkTimer = 0.58;
            const colors = [0xff3355, 0x33ddff, 0xffd700, 0x55ff66, 0xff66ff];
            const origin = new THREE.Vector3(
                nx - 6 - Math.random() * 18,
                2.5 + Math.random() * 6.5,
                -15 - Math.random() * 12
            );
            this.world.fireworksEmitter.burstFirework(origin, colors[Math.floor(Math.random() * colors.length)]);
        }

        if (ct >= totalCourtyardDur) {
            this.phase = 'ended';
            this.player.forcedLookTarget = null;
            this.player.forcedLookSpeed = 5.0;
            this.player.cinematicBobOffset = 0;
            this.player.cinematicRollOffset = 0;
            if (this.player.rb) this.player.rb.useGravity = true;
            if (this.player.collider) this.player.collider.enabled = true;
            this.ui.showEnding3();
        }
    }

    _updateAct4(deltaTime) {
        this.ui.updateStealthHUD(false, 0, 1, this.engine.audioSystem.micEnabled, false);

        if (this.phase === 'act4_tv_twist') {
            const t = this.phaseTimer;
            // Strictly synchronized to pre-recorded tv_emergency_voice.wav timestamps:
            // line1: 0.75s..6.93s | line2: 7.28s..15.40s | line3: 15.80s..19.43s
            if (this._twistStep === 0 && t >= 0.72) {
                this._twistStep = 1;
                this.ui.showSubtitle(tr('sub.tv_anchor_format', { line: this._tvLine1 }), 6300, 'tv');
            } else if (this._twistStep === 1 && t >= 7.25) {
                this._twistStep = 2;
                this.ui.showSubtitle(tr('sub.tv_anchor_format', { line: this._tvLine2 }), 8200, 'tv');
            } else if (this._twistStep === 2 && t >= 15.75) {
                this._twistStep = 3;
                this.ui.showSubtitle(tr('sub.tv_anchor_format', { line: this._tvLine3 }), 4800, 'tv');

                this.player.controlsLocked = true;
                this.player.allowLookWhileLocked = false;
                if (this.player.rb) this.player.rb.velocity.set(0, 0, 0);
                this._twistPlayerStartPos.copy(this.player.transform.position);
                this.player.isCrouching = false;
                this.player.targetEyeHeight = 1.54;

                if (this.world.doors?.hall && !this.world.doors.hall.isOpen()) {
                    this.world.doors.hall.setOpen(true);
                }
                this.monster.showMidnightEyesInHallway();
                this.engine.renderer.triggerGlitch(1.0);

                this._twistLookTarget.set(1.58, 0.96, -1.0);
                this.player.forcedLookSpeed = 2.2;
                this.player.forcedLookTarget = this._twistLookTarget;

                const a = this.engine.audioSystem;
                for (const [id, entry] of a.activeLoops.entries()) {
                    a.setLoopVolume(id, Math.min(0.02, (entry.baseVolume ?? 0.4) * 0.06), 2.5);
                }
            }

            if (this._twistStep >= 3) {
                const alignT = Math.min(1, (t - 15.75) / 1.8);
                const ease = alignT * alignT * (3 - 2 * alignT);
                const px = THREE.MathUtils.lerp(this._twistPlayerStartPos.x, 0.45, ease);
                const pz = THREE.MathUtils.lerp(this._twistPlayerStartPos.z, -0.35, ease);
                this.player.transform.position.set(px, 0, pz);
                if (this.player.rb) this.player.rb.position.set(px, 0, pz);

                this._twistLookTarget.lerp(new THREE.Vector3(3.0, 1.56, 1.55), Math.min(1, deltaTime * 1.4));

                if (t >= 20.8) {
                    this._triggerMidnightClimax();
                }
            }
            return;
        }

        if (this.phase === 'act4_midnight') {
            const t = this.phaseTimer;
            this._fireworkTimer -= deltaTime;
            if (this._fireworkTimer <= 0) {
                this._fireworkTimer = 0.72;
                const colors = [0xff3355, 0x33ddff, 0xffd700, 0x55ff66, 0xff66ff];
                const origin = new THREE.Vector3(
                    (Math.random() - 0.5) * 18,
                    4.2 + Math.random() * 6.5,
                    -14 - Math.random() * 12
                );
                this.world.fireworksEmitter.burstFirework(origin, colors[Math.floor(Math.random() * colors.length)]);
            }

            if (t >= 1.0 && t <= 8.5) {
                const u = Math.min(1, (t - 1.0) / 7.5);
                const p0 = this._midnightStartPos;
                const p1 = { x: 0.75, z: -1.6 };
                const p2 = { x: 0.85, z: -3.5 };
                const p3 = { x: 0.85, z: -4.18 };
                let nx, nz;
                if (u < 0.42) {
                    const lu = u / 0.42;
                    nx = THREE.MathUtils.lerp(p0.x, p1.x, lu);
                    nz = THREE.MathUtils.lerp(p0.z, p1.z, lu);
                } else if (u < 0.78) {
                    const lu = (u - 0.42) / 0.36;
                    nx = THREE.MathUtils.lerp(p1.x, p2.x, lu);
                    nz = THREE.MathUtils.lerp(p1.z, p2.z, lu);
                } else {
                    const lu = (u - 0.78) / 0.22;
                    nx = THREE.MathUtils.lerp(p2.x, p3.x, lu);
                    nz = THREE.MathUtils.lerp(p2.z, p3.z, lu);
                }
                this.player.transform.position.set(nx, 0, nz);
                if (this.player.rb) this.player.rb.position.set(nx, 0, nz);
                this.player.cinematicBobOffset = Math.sin(t * 5.2) * 0.028 * (1 - Math.max(0, (u - 0.9) * 10));

                this._midnightWalkStepTimer -= deltaTime;
                if (this._midnightWalkStepTimer <= 0 && u < 0.96) {
                    this._midnightWalkStepTimer = 0.62;
                    const stepId = nz < -3.5 ? 'footstep_snow' : 'footstep_parquet';
                    this.engine.audioSystem.playSpatialOneShot(stepId, this.player.transform.position, { volume: 0.24 });
                }
            } else if (t > 8.5) {
                this.player.cinematicBobOffset = THREE.MathUtils.lerp(this.player.cinematicBobOffset || 0, 0, Math.min(1, deltaTime * 5));
            }

            if (t < 1.8) {
                this._act4LookTarget.lerp(new THREE.Vector3(3.08, 1.35, 4.4), Math.min(1, deltaTime * 3.0));
            } else if (t < 4.5) {
                this._act4LookTarget.lerp(new THREE.Vector3(0.6, 0.8, -8.5), Math.min(1, deltaTime * 1.6));
            } else {
                const swayY = 0.2 + Math.sin((t - 4.5) * 0.7) * 1.4;
                this._act4LookTarget.lerp(new THREE.Vector3(-0.6, swayY, -24.0), Math.min(1, deltaTime * 1.5));
            }

            if (t >= 9.2) {
                this._fadeVal = Math.max(0, 1.0 - (t - 9.2) / 3.4);
                this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
            }

            if (t >= 12.8) {
                this.phase = 'ended';
                this.player.forcedLookTarget = null;
                this.player.forcedLookSpeed = 5.0;
                this.player.cinematicBobOffset = 0;
                this.ui.showEnding1();
            }
        }
    }
}

export default StoryDirector;

import * as THREE from 'three';
import { Interactable } from '../../lumina/index.js';

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

        this._noiseSustain = 0;
        this._assaultStep = 0;
        this._fireworkTimer = 0;
        this._fadeVal = 1.0;
        this._twistStep = 0;
        this._twistSpeechDoneElapsed = 0;
        this._twistLookTarget = new THREE.Vector3();
        this._twistPlayerStartPos = new THREE.Vector3();
        this._midnightStartPos = new THREE.Vector3();
        this._midnightWalkStepTimer = 0;
        this._act4LookTarget = new THREE.Vector3();

        this.act1Tasks = {};
        this.act4Inspected = {};
        this._tvBroadcastPlayed = false;

        this._initAudioManifest();
        this._bindInteractables();
        this._bindMonsterCallbacks();
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
            door_bang: './assets/audio/door_bang.mp3'
        });
    }

    _bindMonsterCallbacks() {
        this.monster.setCallbacks({
            onJumpscare: (reason) => {
                this.phase = 'jumpscare_delay';
                this.phaseTimer = 0;
                this._jumpscareReason = reason;
                this.player.controlsLocked = true;
                if (this.player.isHidden) this.player.exitHidingSpot();
            },
            onTrapLeft: () => {
                this._transitionToAct4();
            }
        });
    }

    _bindInteractables() {
        const w = this.world;

        w.frontDoor.go.addComponent(Interactable, {
            maxDistance: 2.8,
            promptText: () => {
                if (this.act === 1) return '[E] Посмотреть в глазок';
                if (this.act === 4 && !this.act4Inspected.door) return '[E] Осмотреть выбитую дверь';
                return '';
            },
            canInteract: () => (this.act === 1 && !this.player.isPeephole) || (this.act === 4 && !this.act4Inspected.door),
            onInteract: () => {
                if (this.act === 1) {
                    this.player.enterPeephole();
                    if (!this.act1Tasks.peephole) {
                        this.act1Tasks.peephole = true;
                        this.ui.showSubtitle('На лестнице никого. Тихо... Только лампочка гудит.', 3800);
                        this._refreshObjectives();
                    }
                } else if (this.act === 4) {
                    this._inspectPoint('door', 'Он выбил её одним ударом...');
                }
            }
        });

        w.bathroomSink.addComponent(Interactable, {
            promptText: '[Удерживать E] Умыться холодной водой',
            holdDuration: 1.6,
            canInteract: () => this.act === 1 && !this.act1Tasks.wash,
            onInteract: () => {
                this.act1Tasks.wash = true;
                this.engine.audioSystem.playSpatialOneShot('steam_hiss', w.bathroomSink.transform.position, { volume: 0.4 });
                this.ui.showSubtitle('Освежился. Сон как рукой сняло.', 3200);
                this._refreshObjectives();
            }
        });

        if (w.toilet) {
            w.toilet.addComponent(Interactable, {
                maxDistance: 2.6,
                promptText: '[E] Смыть воду',
                canInteract: () => this.act === 1 || this.act === 2,
                onInteract: () => {
                    this.engine.audioSystem.playSpatialOneShot('steam_hiss', w.toilet.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle('Старый бачок шумит на всю квартиру.', 2600);
                }
            });
        }

        if (w.interiorDoors) {
            for (const door of w.interiorDoors) {
                door.pivot.addComponent(Interactable, {
                    maxDistance: 2.8,
                    promptText: () => (door.isOpen() ? `[E] Закрыть дверь ${door.label}` : `[E] Открыть дверь ${door.label}`),
                    canInteract: () => !this.player.isHidden && !this.player.isPeephole,
                    onInteract: () => door.toggle()
                });
            }
        }

        const treeTargets = [];
        w.treeGO.transform.traverse(c => { if (c.isMesh) treeTargets.push(c); });
        w.fallenSantaHat.traverse(c => { if (c.isMesh) treeTargets.push(c); });
        w.treeGO.addComponent(Interactable, {
            targetMeshes: treeTargets,
            promptText: () => {
                if (this.act === 1 && !this.act1Tasks.garland) return '[E] Включить гирлянду';
                if (this.act === 4 && !this.act4Inspected.tree) return '[E] Осмотреть поваленную ёлку';
                return '';
            },
            canInteract: () => (this.act === 1 && !this.act1Tasks.garland) || (this.act === 4 && !this.act4Inspected.tree),
            onInteract: () => {
                if (this.act === 1) {
                    this.act1Tasks.garland = true;
                    w.garlandOn = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.treeGO.transform.position);
                    this.ui.showSubtitle('Так уютнее. Хоть какое-то новогоднее настроение.', 3200);
                    this._refreshObjectives();
                } else if (this.act === 4) {
                    this._inspectPoint('tree', 'Обычный дешёвый колпак... И зеркало с серванта вдребезги.');
                }
            }
        });

        w.table.go.addComponent(Interactable, {
            promptText: () => {
                if (this.player.heldItem) return `[E] Поставить на стол (${this._itemName(this.player.heldItem)})`;
                if (!this.act1Tasks.table) return '[Удерживать E] Разложить стол-книжку';
                if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink) {
                    return '[Удерживать E] Налить себе шампанского';
                }
                return '';
            },
            holdDuration: () => {
                if (this.player.heldItem) return 0;
                if (!this.act1Tasks.table) return 1.4;
                if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink) return 1.2;
                return 0;
            },
            canInteract: () => this.act === 1 && (
                !this.act1Tasks.table ||
                !!this.player.heldItem ||
                (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink)
            ),
            onInteract: () => {
                if (!this.act1Tasks.table) {
                    this.act1Tasks.table = true;
                    w.table.unfold();
                    this.engine.audioSystem.playSpatialOneShot('door_open', w.table.go.transform.position);
                    if (!this.player.heldItem) {
                        this.ui.showSubtitle('Стол накрыт. Теперь тарелки и еду.', 3200);
                    }
                }
                if (this.player.heldItem) {
                    const item = this.player.heldItem;
                    if (w.itemsOnTable[item]) w.itemsOnTable[item].visible = true;
                    this.act1Tasks[item] = true;
                    this.player.setHeldItem(null);
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.table.go.transform.position);
                    this._checkAct1IndoorCompletion();
                } else if (this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.pourDrink) {
                    this.act1Tasks.pourDrink = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.table.go.transform.position);
                    this.ui.showSubtitle(
                        this.act1Tasks.watchTv
                            ? 'С наступающим... Надо выйти на балкон, перекурить.'
                            : 'С наступающим... Хорошо сидим. Послушаю ещё новости по телевизору.',
                        4000
                    );
                }
                this._refreshObjectives();
            }
        });

        w.table.wreckedGO.addComponent(Interactable, {
            promptText: '[E] Осмотреть разгромленный стол',
            canInteract: () => this.act === 4 && !this.act4Inspected.table,
            onInteract: () => {
                this._inspectPoint('table', 'Весь ужин... Насмарку.');
            }
        });

        w.sideboardCrystal.addComponent(Interactable, {
            promptText: '[E] Взять хрустальные бокалы',
            canInteract: () => this.act === 1 && !this.act1Tasks.crystal && !this.player.heldItem,
            onInteract: () => {
                w.sideboardCrystal.transform.visible = false;
                this.player.setHeldItem('crystal');
                this.engine.audioSystem.playSpatialOneShot('pickup', w.sideboardCrystal.transform.position);
            }
        });

        w.pantryPickles.addComponent(Interactable, {
            promptText: '[E] Взять банку солений',
            canInteract: () => this.act === 1 && !this.act1Tasks.pickles && !this.player.heldItem,
            onInteract: () => {
                w.pantryPickles.transform.visible = false;
                this.player.setHeldItem('pickles');
                this.engine.audioSystem.playSpatialOneShot('pickup', w.pantryPickles.transform.position);
            }
        });

        w.fridgeOlivier.addComponent(Interactable, {
            promptText: '[E] Взять салатник с оливье',
            canInteract: () => this.act === 1 && w.fridge.isOpen() && !this.act1Tasks.olivier && !this.player.heldItem,
            onInteract: () => {
                w.fridgeOlivier.transform.visible = false;
                this.player.setHeldItem('olivier');
                this.engine.audioSystem.playSpatialOneShot('pickup', w.fridgeOlivier.transform.position);
            }
        });

        w.fridgeMeat.addComponent(Interactable, {
            promptText: '[E] Взять нарезку',
            canInteract: () => this.act === 1 && w.fridge.isOpen() && !this.act1Tasks.meat && !this.player.heldItem,
            onInteract: () => {
                w.fridgeMeat.transform.visible = false;
                this.player.setHeldItem('meat');
                this.engine.audioSystem.playSpatialOneShot('pickup', w.fridgeMeat.transform.position);
            }
        });

        w.ovenChicken.addComponent(Interactable, {
            promptText: '[E] Забрать запечённую курицу',
            canInteract: () => this.act === 1 && w.stove.isOpen() && !this.act1Tasks.chicken && !this.player.heldItem,
            onInteract: () => {
                w.ovenChicken.transform.visible = false;
                this.player.setHeldItem('chicken');
                this.engine.audioSystem.playSpatialOneShot('pickup', w.ovenChicken.transform.position);
                this.ui.showSubtitle('Вроде не подгорела. Отлично.', 3500);
            }
        });

        w.champagneBottle.addComponent(Interactable, {
            maxDistance: 3.0,
            promptText: '[E] Взять шампанское из снега',
            canInteract: () => this.act === 1 && !this.act1Tasks.champagne && !this.player.heldItem,
            onInteract: () => {
                w.champagneBottle.transform.visible = false;
                this.engine.audioSystem.playSpatialOneShot('pickup', w.champagneBottle.transform.position);
                this.player.setHeldItem('champagne');
                this.ui.showSubtitle('Взял шампанское. Поставлю на стол.', 3400);
                this._refreshObjectives();
            }
        });

        w.tvGameObject.addComponent(Interactable, {
            promptText: () => this.act === 1
                ? '[E] Послушать новогодние новости по ТВ'
                : '[E] Посмотреть экстренный выпуск по ТВ',
            canInteract: () => (
                (this.act === 1 && this._isIndoorChoresDone() && this.act1Tasks.champagne && !this.act1Tasks.watchTv) ||
                (this.act === 4 && !this.act4Inspected.tv)
            ),
            onInteract: () => {
                if (this.act === 1) {
                    this.act1Tasks.watchTv = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.tvGameObject.transform.position, { volume: 0.4 });
                    this.ui.showSubtitle('«Уважаемые телезрители, до боя курантов остаётся совсем немного времени...»', 4800);
                    this._refreshObjectives();
                    return;
                }
                const countOthers = ['door', 'table', 'tree'].filter(k => this.act4Inspected[k]).length;
                if (countOthers < 3) {
                    this.ui.showSubtitle('Сначала нужно осмотреть разгром в квартире...', 3000);
                    return;
                }
                this._triggerTVTwist();
            }
        });

        for (const spot of w.hidingSpots) {
            const hasSolidDoor = spot.id === 'wardrobe' || spot.id === 'pantry';
            if (hasSolidDoor && spot.doorPivot) {
                spot.doorPivot.addComponent(Interactable, {
                    maxDistance: 2.6,
                    promptText: () => spot.getDoorPrompt(),
                    canInteract: () => !this.player.isHidden,
                    onInteract: () => spot.setDoorClosed(!spot.isDoorClosed())
                });
            }

            spot.enterObject.addComponent(Interactable, {
                promptText: spot.enterPrompt,
                maxDistance: 2.3,
                canInteract: () => !this.player.isHidden && (this.act === 3 || (!hasSolidDoor && this.act === 1)),
                onInteract: () => {
                    if (this.act === 1) {
                        this.ui.showSubtitle('Зачем мне сейчас прятаться? Надо готовиться к празднику.', 2800);
                        return;
                    }
                    this.player.enterHidingSpot(spot);
                }
            });
        }

        for (const sw of w.lightSwitches) {
            sw.go.addComponent(Interactable, {
                maxDistance: 3.0,
                promptText: () => {
                    if (this.act === 4) return `[E] Щёлкнуть выключателем (${sw.label})`;
                    return sw.room.isOn()
                        ? `[E] Выключить свет ${sw.label}`
                        : `[E] Включить свет ${sw.label}`;
                },
                canInteract: () => !this.player.isHidden && !this.player.isPeephole,
                onInteract: () => {
                    this.engine.audioSystem.playSpatialOneShot('pickup', sw.go.transform.position, { volume: 0.45 });
                    if (this.act === 3) {
                        if (sw.room.isOn()) {
                            sw.room.setOn(false);
                        } else {
                            this.ui.showSubtitle('Нельзя сейчас включать свет — он сразу меня заметит!', 3000);
                        }
                        return;
                    }
                    if (this.act === 4) {
                        this.ui.showSubtitle('Пробки выбило... Свет не зажигается.', 3000);
                        return;
                    }
                    sw.room.toggle();
                }
            });
        }

        if (w.decorQuest) {
            w.decorQuest.box.addComponent(Interactable, {
                maxDistance: 2.6,
                promptText: '[E] Взять коробку с новогодней мишурой',
                canInteract: () => this.act === 1 && !this.act1Tasks.decorBox,
                onInteract: () => {
                    this.act1Tasks.decorBox = true;
                    w.decorQuest.box.transform.visible = false;
                    this.engine.audioSystem.playSpatialOneShot('pickup', w.decorQuest.box.transform.position, { volume: 0.45 });
                    this.ui.showSubtitle('Надо украсить всю квартиру: зал, кухню и прихожую!', 3800);
                    this._refreshObjectives();
                }
            });

            const roomSpecs = [
                { key: 'hall', taskKey: 'decorHall', prompt: '[Удерживать E] Украсить зал мишурой и снежинками', quote: 'Зал сразу стал наряднее.' },
                { key: 'kitchen', taskKey: 'decorKitchen', prompt: '[Удерживать E] Украсить кухню мишурой к празднику', quote: 'На кухне теперь тоже чувствуется Новый год.' },
                { key: 'hallway', taskKey: 'decorHallway', prompt: '[Удерживать E] Украсить прихожую мишурой и венком', quote: 'Прихожая украшена!' }
            ];
            for (const spec of roomSpecs) {
                const spotGO = w.decorQuest.spots[spec.key];
                spotGO.addComponent(Interactable, {
                    maxDistance: 2.8,
                    promptText: () => this.act1Tasks.decorBox ? spec.prompt : '[E] Украсить комнату (нужна коробка с мишурой)',
                    holdDuration: () => (this.act1Tasks.decorBox ? 1.8 : 0),
                    canInteract: () => this.act === 1 && !this.act1Tasks[spec.taskKey],
                    onInteract: () => {
                        if (!this.act1Tasks.decorBox) {
                            this.ui.showSubtitle('Сначала нужно взять коробку с мишурой в прихожей.', 3200);
                            return;
                        }
                        this.act1Tasks[spec.taskKey] = true;
                        w.decorQuest.meshes[spec.key].visible = true;
                        this.engine.audioSystem.playSpatialOneShot('pickup', spotGO.transform.position, { volume: 0.45 });
                        const t = this.act1Tasks;
                        if (t.decorHall && t.decorKitchen && t.decorHallway) {
                            t.decorate = true;
                            this.ui.showSubtitle('Вся квартира украшена к Новому году!', 3600);
                        } else {
                            this.ui.showSubtitle(spec.quote, 3000);
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

    _itemName(key) {
        const map = {
            crystal: 'хрусталь',
            pickles: 'соленья',
            olivier: 'оливье',
            meat: 'нарезку',
            chicken: 'курицу',
            champagne: 'шампанское'
        };
        return map[key] || key;
    }

    _isIndoorChoresDone() {
        const t = this.act1Tasks;
        return t.peephole && t.wash && t.garland && t.decorate && t.table && t.crystal && t.pickles && t.olivier && t.meat && t.chicken;
    }

    _checkAct1IndoorCompletion() {
        if (this._isIndoorChoresDone()) {
            if (this.act1Tasks.champagne) {
                this.ui.showSubtitle('Стол накрыт! Можно спокойно посмотреть новости и налить себе выпить.', 4400);
            } else {
                this.ui.showSubtitle('Стол почти готов! Осталось принести шампанское с балкона.', 4200);
            }
        }
    }

    stopAllAudioLoops() {
        const a = this.engine.audioSystem;
        ['tv_audio', 'fridge_hum', 'clock_tick', 'wind', 'horror_darkness', 'heartbeat', 'monster_breath', 'melancholy'].forEach(id => a.stopLoop(id));
        this.engine.renderer.setPostProcessParams({ fade: 1.0, panic: 0.0 });
        try {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        } catch (e) { }
        this.phase = 'menu';
    }

    _resetWorldForRun(fromCheckpoint) {
        const w = this.world;
        this.stopAllAudioLoops();

        if (this.player.isHidden) this.player.exitHidingSpot();
        if (this.player.isPeephole) this.player.exitPeephole();
        this.player.controlsLocked = false;
        this.player.forcedLookTarget = null;
        this.player.forcedLookSpeed = 5.0;
        this.player.forcedFov = null;
        this.player.cinematicBobOffset = 0;
        this.player.setCigarette(false);
        this.player.setHeldItem(null);
        this._fadeVal = 1.0;
        this._twistStep = 0;
        this._twistSpeechDoneElapsed = 0;
        this.engine.renderer.setPostProcessParams({ fade: 1.0, panic: 0.0 });
        try {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        } catch (e) { }

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
        w.fallenMirror.visible = false;

        w.table.go.transform.visible = true;
        w.table.wreckedGO.transform.visible = false;

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
        if (w.neighborWindowCanvas) w.neighborWindowCanvas.setMode('dark');
        this.monster.setIdleInNeighborRoom();

        w.hidingSpots.forEach(s => s.setDoorClosed(!!s.defaultClosed, true));
        w.powerOut = false;
        this._balconySniffQuote = false;
        this._balconyPoundQuote = false;
        this._endingTriggered = false;
        this.player.controlsLocked = false;
        this.player.forcedLookTarget = null;
        this.player.cinematicBobOffset = 0;
        if (this.player.rb) this.player.rb.useGravity = true;
        if (this.player.collider) this.player.collider.enabled = true;

        if (w.roomLights.hall) w.roomLights.hall.setOn(!!fromCheckpoint);
        if (w.roomLights.kitchen) w.roomLights.kitchen.setOn(true);
        if (w.roomLights.hallway) w.roomLights.hallway.setOn(true);
        if (w.roomLights.bathroom) w.roomLights.bathroom.setOn(true);
        if (w.interiorDoors) {
            for (const door of w.interiorDoors) door.setOpen(!!fromCheckpoint, false, true);
        }
        w.cigSmokeEmitter.setActive(false);

        this.engine.renderer.setFOV(75);
        this.engine.renderer.setPostProcessParams({ panic: 0, peephole: 0, fade: 1.0 });
        const vhsVal = this.ui?.el?.rngVhs ? parseFloat(this.ui.el.rngVhs.value) : 0.2;
        this.ui?.applyVHSIntensity?.(vhsVal);

        if (!fromCheckpoint) {
            w.sideboardCrystal.transform.visible = true;
            w.pantryPickles.transform.visible = true;
            w.fridgeOlivier.transform.visible = true;
            w.fridgeMeat.transform.visible = true;
            w.ovenChicken.transform.visible = true;
            w.champagneBottle.transform.visible = true;
            if (w.decorQuest) {
                w.decorQuest.box.transform.visible = true;
                w.decorQuest.meshes.hall.visible = false;
                w.decorQuest.meshes.kitchen.visible = false;
                w.decorQuest.meshes.hallway.visible = false;
            }
            if (w.mistletoe) {
                w.mistletoe.hanging.visible = true;
                w.mistletoe.trampled.visible = false;
            }
            if (w.treeGarlandGroup) w.treeGarlandGroup.visible = true;
            if (w.tornGarland) w.tornGarland.visible = false;
            if (w.courtyardStroller) {
                w.courtyardStroller.visible = false;
                w.courtyardStroller.position.set(-14.0, -6.5, -17.5);
            }
            w.table.fold();
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
            if (w.decorQuest) {
                w.decorQuest.box.transform.visible = false;
                w.decorQuest.meshes.hall.visible = true;
                w.decorQuest.meshes.kitchen.visible = true;
                w.decorQuest.meshes.hallway.visible = true;
            }
            w.table.unfold();
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
        w.garlandOn = true;
        if (w.decorQuest?.meshes?.hall) w.decorQuest.meshes.hall.visible = true;

        this.player.controlsLocked = true;
        this.player.isCrouching = false;
        this.player.targetEyeHeight = 1.54;
        this.player.eyeHeight = 1.54;
        this.player.setPose(new THREE.Vector3(0.45, 0.05, -3.85), 0.12, -0.04);
    }

    startNewGame() {
        this._resetWorldForRun(false);
        this.act = 1;
        this.phase = 'act1';
        this.phaseTimer = 0;
        this.clockMinutes = 0;
        this.world.setClockTime(0);

        this.act1Tasks = {
            peephole: false,
            wash: false,
            garland: false,
            decorBox: false,
            decorHall: false,
            decorKitchen: false,
            decorHallway: false,
            decorate: false,
            table: false,
            crystal: false,
            pickles: false,
            olivier: false,
            meat: false,
            chicken: false,
            champagne: false,
            watchTv: false,
            pourDrink: false
        };

        this.player.setPose(
            this.world.playerSpawn.position.clone(),
            this.world.playerSpawn.yaw,
            this.world.playerSpawn.pitch
        );
        this._fadeVal = 0.0;
        this.engine.renderer.setPostProcessParams({ fade: 0.0 });

        const a = this.engine.audioSystem;
        a.startSpatialLoop('tv_audio', 'ogonyok_waltz', new THREE.Vector3(0.65, 0.94, 1.08), { volume: 0.45, tvFilter: true });
        a.startSpatialLoop('fridge_hum', 'fridge_hum', new THREE.Vector3(3.75, 0.9, -2.85), { volume: 0.35 });
        a.startSpatialLoop('clock_tick', 'clock_tick', new THREE.Vector3(1.9, 2.08, -1.1), { volume: 0.18 });
        a.startSpatialLoop('wind', 'wind_snow', new THREE.Vector3(0.6, 1.4, -5.0), { volume: 0.25 });

        this.ui.showGameplayHUD();
        this.ui.setClockText('23:30');
        this.ui.showSubtitle('Чёрт... Уснул. Половина двенадцатого, а стол ещё пустой. Надо успеть до курантов.', 5200);
        this._refreshObjectives();
    }

    loadCheckpoint2345() {
        this._resetWorldForRun(true);
        this.player.setPose(new THREE.Vector3(1.0, 0.05, -3.9), 0.12, -0.05);
        this._fadeVal = 1.0;

        const a = this.engine.audioSystem;
        a.startSpatialLoop('tv_audio', 'ogonyok_waltz', new THREE.Vector3(0.65, 0.94, 1.08), { volume: 0.12, tvFilter: true });
        a.startSpatialLoop('fridge_hum', 'fridge_hum', new THREE.Vector3(3.75, 0.9, -2.85), { volume: 0.60 });
        a.startSpatialLoop('clock_tick', 'clock_tick', new THREE.Vector3(1.9, 2.08, -1.1), { volume: 0.45 });
        a.startSpatialLoop('wind', 'wind_snow', new THREE.Vector3(0.6, 1.4, -5.0), { volume: 0.40 });

        this.ui.showGameplayHUD();
        this._transitionToAct3();
    }

    _transitionToAct2() {
        this.act = 2;
        this.phase = 'act2_smoke';
        this.phaseTimer = 0;
        this.clockMinutes = 13;
        this.world.setClockTime(13);
        this.ui.setClockText('23:43');
        this.player.setCigarette(true);
        this.world.cigSmokeEmitter.setActive(true);
        if (this.world.courtyardStroller) {
            this.world.courtyardStroller.visible = true;
            this.world.courtyardStroller.position.set(-14.0, -6.5, -17.5);
        }
        this.ui.setObjectives('АКТ II: СВИДЕТЕЛЬ', [{ text: 'Покурить на балконе [ЛКМ / F — затянуться]', done: false }]);
        this.ui.showSubtitle('Морозный воздух... И вон сосед внизу куда-то пошёл.', 4200);
    }

    _startAct2ZoomSequence() {
        this.phase = 'act2_zoom';
        this.phaseTimer = 0;
        this.player.controlsLocked = true;
        this.player.forcedLookTarget = this.world.neighborScene.roomCenter;
        this.player.forcedFov = 25;
        this.monster.startWindowMurder();
    }

    _transitionToAct3() {
        this.act = 3;
        this.phase = 'act3_chase';
        this.phaseTimer = 0;
        this.clockMinutes = 15;
        this.world.setClockTime(15);
        this.ui.setClockText('23:45');

        this.hasCheckpoint = true;
        localStorage.setItem('sng_checkpoint_2345', '1');
        this.ui.setCheckpointAvailable(true);

        const a = this.engine.audioSystem;
        a.startSpatialLoop('horror_darkness', 'horror_darkness', new THREE.Vector3(0, 1, -2), { volume: 0.13, checkOcclusion: false });
        a.startSpatialLoop('heartbeat', 'heartbeat', new THREE.Vector3(0, 1, 0), { volume: 0.28, checkOcclusion: false });
        a.setLoopVolume('tv_audio', 0.12, 0.4);
        a.setLoopVolume('fridge_hum', 0.62, 0.4);
        a.setLoopVolume('clock_tick', 0.48, 0.4);
        a.setLoopVolume('wind', 0.40, 0.4);

        this.monster.startCourtyardSprint();
        this.ui.setObjectives('АКТ III: ОХОТА', [
            { text: 'Бегите в квартиру и закройте балкон (по желанию)', done: false },
            { text: 'Спрячьтесь в шкаф / кладовку / ванную / под диван', done: false },
            { text: 'Закройте дверцу или шторку [E] и не шумите!', done: false }
        ]);
        this.ui.showSubtitle('ОН БЕЖИТ СЮДА! Надо срочно спрятаться!', 4500);
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
        this._tvBroadcastPlayed = false;

        const a = this.engine.audioSystem;
        a.stopLoop('tv_audio');
        a.stopLoop('horror_darkness');
        a.stopLoop('heartbeat');
        a.startSpatialLoop('melancholy', 'melancholy_ambient', new THREE.Vector3(0, 1.5, 0), { volume: 0.35, checkOcclusion: false });

        this.world.setApartmentDestroyedState();
        this.engine.renderer.setPostProcessParams({ panic: 0.0, aberration: 0.0024 });

        this.ui.showSubtitle('Кажется... он ушёл вниз по лестнице. Что он сделал с квартирой?!', 4800);
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
        this._twistSpeechDoneElapsed = 0;
        this._refreshAct4Objectives();

        const a = this.engine.audioSystem;
        for (const [id, entry] of a.activeLoops.entries()) {
            const quietVol = Math.min(0.04, (entry.baseVolume ?? 0.4) * 0.12);
            a.setLoopVolume(id, quietVol, 0.8);
        }

        const tvPos = new THREE.Vector3(0.65, 0.94, 1.08);
        this._tvLine1 = 'Внимание! Экстренный выпуск. В районе орудует маньяк в костюме Санта-Клауса.';
        this._tvLine2 = 'На данный момент зафиксировано два нападения: в доме номер четырнадцать и по улице Ленина, двенадцать, квартира тридцать четыре.';
        this._tvLine3 = 'По данным следствия, тела в обеих квартирах уже обнаружены...';

        a.speakTVBroadcast(`${this._tvLine1} ${this._tvLine2} ${this._tvLine3}`, tvPos);
        this.ui.showSubtitle(`[ДИКТОР ТВ]: «${this._tvLine1}»`, 5200, 'tv');
    }

    _triggerMidnightClimax() {
        this.phase = 'act4_midnight';
        this.phaseTimer = 0;
        this._fadeVal = 1.0;
        this._midnightWalkStepTimer = 0;
        this._midnightStartPos.copy(this.player.transform.position);
        this._act4LookTarget.set(3.08, 1.35, 3.6);
        this.player.controlsLocked = true;
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
        a.playSpatialOneShot('chimes', new THREE.Vector3(0.65, 0.94, 1.08), { bufferKey: 'chimes', volume: 0.8, checkOcclusion: false });
        a.playSpatialOneShot('fireworks', new THREE.Vector3(0, 4, -14), { bufferKey: 'fireworks', volume: 0.6, maxDistance: 60 });
        this.ui.showSubtitle('С Новым Годом...', 4800);
        this.ui.setObjectives('00:00', []);
    }

    _refreshObjectives() {
        if (this.act !== 1) return;
        const t = this.act1Tasks;
        const decorDoneCount = (t.decorHall ? 1 : 0) + (t.decorKitchen ? 1 : 0) + (t.decorHallway ? 1 : 0);
        const list = [
            { text: 'Проверить глазок входной двери', done: t.peephole },
            { text: 'Умыться в ванной', done: t.wash },
            { text: 'Разложить стол-книжку в зале', done: t.table },
            { text: 'Включить гирлянду на ёлке', done: t.garland },
            {
                text: t.decorBox
                    ? `Украсить всю квартиру: зал, кухню и прихожую (${decorDoneCount}/3)`
                    : `Взять коробку с мишурой в прихожей и украсить квартиру (${decorDoneCount}/3)`,
                done: !!t.decorate
            },
            { text: 'Принести хрусталь из серванта на стол', done: t.crystal },
            { text: 'Принести соленья из кладовки на стол', done: t.pickles },
            { text: 'Принести оливье и нарезку из холодильника', done: t.olivier && t.meat },
            { text: 'Достать курицу из духовки на стол', done: t.chicken }
        ];
        if (this._isIndoorChoresDone()) {
            if (!t.champagne) {
                list.push({ text: 'Принести шампанское с балкона на стол', done: false });
            } else {
                list.push({ text: 'Послушать новости по телевизору', done: !!t.watchTv });
                list.push({ text: 'Налить себе шампанского за столом', done: !!t.pourDrink });
                if (t.watchTv && t.pourDrink) {
                    list.push({ text: 'Выйти на балкон — перекурить', done: false });
                }
            }
        }
        this.ui.setObjectives('АКТ I: ПОДГОТОВКА К НОВОМУ ГОДУ', list);
    }

    _refreshAct4Objectives() {
        const d = this.act4Inspected;
        this.ui.setObjectives('АКТ IV: ПОСЛЕДСТВИЯ', [
            { text: 'Осмотреть выбитую дверь в прихожей', done: d.door },
            { text: 'Осмотреть перевёрнутый стол в зале', done: d.table },
            { text: 'Осмотреть поваленную ёлку', done: d.tree },
            { text: 'Подойти к телевизору (Экстренный выпуск)', done: d.tv }
        ]);
    }

    update(deltaTime) {
        if (this.phase === 'menu') {
            this._updateLightsAndClocks(deltaTime);
            return;
        }
        this.phaseTimer += deltaTime;

        if (this._fadeVal < 1.0 && this.phase !== 'act4_midnight' && this.phase !== 'act3_escape_run' && this.phase !== 'ended') {
            this._fadeVal = Math.min(1.0, this._fadeVal + deltaTime * 0.45);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        }

        this.world.crtTV.update(deltaTime);
        if (this.world.neighborWindowCanvas) this.world.neighborWindowCanvas.update(deltaTime);
        this._updateLightsAndClocks(deltaTime);

        this._updatePromptHUD();

        if (this.act === 1) {
            const doneCount = Object.values(this.act1Tasks).filter(Boolean).length;
            const targetMins = Math.min(12, Math.floor((doneCount / 11) * 12));
            if (targetMins > this.clockMinutes) {
                this.clockMinutes = targetMins;
                this.world.setClockTime(this.clockMinutes);
                this.ui.setClockText(`23:${30 + this.clockMinutes}`);
            }

            if (this._isIndoorChoresDone() && this.act1Tasks.champagne && this.act1Tasks.watchTv && this.act1Tasks.pourDrink) {
                const p = this.player.transform.position;
                if (p.z < -3.65 && p.x > -0.9 && p.x < 2.1) {
                    this._transitionToAct2();
                }
            }
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
                    ? 'Существо услышало ваш шум!'
                    : (this._jumpscareReason === 'door_open'
                        ? 'Вы не закрыли за собой дверцу / шторку укрытия!'
                        : 'Он увидел вас!');
                this.ui.showDeathScreen(reasonMsg);
            }
        }
    }

    _updateLightsAndClocks(deltaTime) {
        if (this.world.updateDoors) {
            this.world.updateDoors(deltaTime);
        }
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
        if (this.player.isPeephole) {
            this.ui.setPrompt('Отойти от глазка');
        } else if (this.player.isHidden && this.player.currentHidingSpot) {
            const spot = this.player.currentHidingSpot;
            this.ui.setPrompt(spot.getDoorPrompt());
        } else if (this.act === 2 && this.phase === 'act2_smoke' && this.player.cigaretteActive && !this.engine.interactionSystem.currentPrompt) {
            this.ui.setPrompt('Затянуться сигаретой');
        } else {
            const basePrompt = this.engine.interactionSystem.currentPrompt;
            const holdRatio = this.engine.interactionSystem.getHoldRatio?.() || 0;
            this.ui.setPrompt(basePrompt && holdRatio > 0 ? `${basePrompt} (${Math.round(holdRatio * 100)}%)` : basePrompt);
        }
    }

    _updateAct2(deltaTime) {
        if (this.phase === 'act2_smoke') {
            const stroller = this.world.courtyardStroller;
            if (stroller && stroller.visible) {
                stroller.position.x = Math.min(14.0, stroller.position.x + deltaTime * 1.65);
                stroller.position.y = -6.5 + Math.abs(Math.sin(this.phaseTimer * 7.0)) * 0.04;
            }
            if (this.player.cigBurn >= 0.48 && this.phaseTimer >= 3.5) {
                this.phase = 'act2_window_lit';
                this.phaseTimer = 0;
                if (stroller) stroller.visible = false;
                this.engine.audioSystem.playSpatialOneShot('door_pound', new THREE.Vector3(-1.0, -5.5, -18.0), { volume: 0.8, maxDistance: 50 });
                this.world.lights.neighborLight.intensity = 5.2;
                if (this.world.neighborWindowCanvas) this.world.neighborWindowCanvas.setMode('lit_idle');
                this.world.neighborScene.gazeTrigger.enabled = true;
                this.ui.showSubtitle('В доме напротив на третьем этаже загорелся свет...', 3800);
                this.ui.setObjectives('АКТ II: СВИДЕТЕЛЬ', [{ text: 'Посмотреть на окно дома напротив', done: false }]);
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
                this.ui.showSubtitle('Он... он меня увидел.', 3200);
            }
            if (this.phaseTimer > 4.9) {
                this._screamPlayed = false;
                this.player.controlsLocked = false;
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
                this.ui.showSubtitle('Тяжёлые шаги бегут вверх по лестнице подъезда!', 3500);
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
                    this.ui.showSubtitle('Он стоит прямо за входной дверью... Принюхивается.', 3400);
                }
            } else if (this._assaultStep === 2 && this.phaseTimer > 2.4) {
                this._assaultStep = 3;
                this.phaseTimer = 0;
                a.playSpatialOneShot('doorbell_soviet', new THREE.Vector3(3.075, 1.8, 4.5), {
                    bufferKey: 'doorbell',
                    volume: 1.05
                });
                this.ui.showSubtitle('Дзинь-дзинь-дзинь... Он давит на звонок!', 2800);
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
                a.startSpatialLoop('tv_audio', 'tv_static', new THREE.Vector3(0.65, 0.94, 1.08), { volume: 0.24, tvFilter: true });

                this.monster.enterApartmentPatrol();
                this.ui.setObjectives('АКТ III: ОХОТА', [
                    { text: 'Не издавайте ни звука и держите дверцу укрытия закрытой!', done: false }
                ]);
            }
        }

        if (this.monster.state === 'patrol' || this.monster.state === 'moving_to_trap' || this.monster.state === 'trap') {
            const p = this.player.transform.position;
            if (!this._endingTriggered && this._assaultStep >= 6 && !this.player.isHidden && p.z > 4.65 && p.x > 2.2 && p.x < 4.1) {
                this._startEscapeRoadCinematic();
                return;
            }

            if (!this._endingTriggered && this.monster.state === 'patrol' && p.z < -3.65 && !this.world.doors.balcony.isOpen()) {
                if (this.monster._balconyState === 'sniffing' && !this._balconySniffQuote) {
                    this._balconySniffQuote = true;
                    this.ui.showSubtitle('Он у балконной двери... Принюхивается.', 2600);
                } else if (this.monster._balconyState === 'pounding' && !this._balconyPoundQuote) {
                    this._balconyPoundQuote = true;
                    this.ui.showSubtitle('Он ломится в балконную дверь! Дерево трещит!', 2800);
                }
                if (this.monster.balconyAssaultDone) {
                    this._endingTriggered = true;
                    this.stopAllAudioLoops();
                    this.phase = 'ended';
                    a.playSpatialOneShot('chimes', new THREE.Vector3(0.5, 2, -6), { bufferKey: 'chimes', volume: 0.9, checkOcclusion: false });
                    this.player.controlsLocked = true;
                    this.ui.showEnding4();
                    return;
                }
            }

            if (noise > 0.54) {
                this._noiseSustain += deltaTime;
                if (this._noiseSustain > 0.25) {
                    this.monster.startChasePlayer('noise');
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
            this.engine.renderer.setPostProcessParams({ panic: 0.05, aberration: 0.0024 });
            this.ui.showSubtitle('Шаги стихли в прихожей... Подождать ещё или выходить?', 4200);
        } else if (this.monster.state !== 'trap') {
            this._trapCueShown = false;
        }
    }

    _startEscapeRoadCinematic() {
        this._endingTriggered = true;
        this.stopAllAudioLoops();
        this.phase = 'act3_escape_run';
        this.phaseTimer = 0;
        this._escapePlacedOnRoad = false;
        this._escapeStepTimer = 0;
        this._escapeFireworkTimer = 0;
        this._escapeLookTarget = new THREE.Vector3(-12, -2.5, -16.5);
        this.ui.updateStealthHUD(false, 0, 1, false, false);
        this.ui.setObjectives('ПОБЕГ', []);
        this.player.controlsLocked = true;
        if (this.player.rb) {
            this.player.rb.useGravity = false;
            this.player.rb.velocity.set(0, 0, 0);
        }
        if (this.player.collider) this.player.collider.enabled = false;
        this.player.forcedLookSpeed = 3.2;
        this.player.forcedLookTarget = this._escapeLookTarget;

        const a = this.engine.audioSystem;
        a.playSpatialOneShot('footstep_concrete', new THREE.Vector3(3.1, 0, 5.0), { volume: 0.9 });
        a.playSpatialOneShot('chimes', new THREE.Vector3(0, 4, -14), { bufferKey: 'chimes', volume: 0.55, checkOcclusion: false });
        a.playSpatialOneShot('fireworks', new THREE.Vector3(-8, 4, -16), { bufferKey: 'fireworks', volume: 0.75, maxDistance: 80 });
        this.ui.showSubtitle('На улицу! Быстрее, прочь отсюда!', 3600);
    }

    _updateEscapeRoadCinematic(deltaTime) {
        const t = this.phaseTimer;
        if (t < 0.6) {
            this._fadeVal = Math.max(0, 1.0 - t / 0.55);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
            return;
        }

        if (!this._escapePlacedOnRoad) {
            this._escapePlacedOnRoad = true;
            this.player.transform.position.set(3.0, -6.08, -15.2);
            if (this.player.rb) this.player.rb.position.set(3.0, -6.08, -15.2);
            this.player.yaw = Math.PI * 0.5;
            this.player.pitch = 0.08;
        }

        if (t < 1.3) {
            this._fadeVal = Math.min(1.0, (t - 0.6) / 0.65);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        } else if (t >= 7.0) {
            this._fadeVal = Math.max(0, 1.0 - (t - 7.0) / 2.2);
            this.engine.renderer.setPostProcessParams({ fade: this._fadeVal });
        }

        const runU = Math.min(1, Math.max(0, (t - 0.6) / 7.8));
        const nx = THREE.MathUtils.lerp(3.0, -26.0, runU);
        const nz = -15.2 + Math.sin(t * 1.4) * 0.18;
        this.player.transform.position.set(nx, -6.08, nz);
        if (this.player.rb) this.player.rb.position.set(nx, -6.08, nz);
        this.player.cinematicBobOffset = Math.sin(t * 12.0) * 0.055;

        const lookY = -2.2 + Math.sin(t * 1.1) * 1.6;
        this._escapeLookTarget.lerp(new THREE.Vector3(nx - 14.0, lookY, -16.8), Math.min(1, deltaTime * 3.5));

        this._escapeStepTimer -= deltaTime;
        if (this._escapeStepTimer <= 0 && t < 8.4) {
            this._escapeStepTimer = 0.28;
            this.engine.audioSystem.playSpatialOneShot('footstep_snow', this.player.transform.position, { volume: 0.45 });
        }

        this._escapeFireworkTimer -= deltaTime;
        if (this._escapeFireworkTimer <= 0) {
            this._escapeFireworkTimer = 0.62;
            const colors = [0xff3355, 0x33ddff, 0xffd700, 0x55ff66, 0xff66ff];
            const origin = new THREE.Vector3(
                nx - 8 - Math.random() * 18,
                2.5 + Math.random() * 6.5,
                -15 - Math.random() * 12
            );
            this.world.fireworksEmitter.burstFirework(origin, colors[Math.floor(Math.random() * colors.length)]);
        }

        if (t >= 9.3) {
            this.phase = 'ended';
            this.player.forcedLookTarget = null;
            this.player.forcedLookSpeed = 5.0;
            this.player.cinematicBobOffset = 0;
            if (this.player.rb) this.player.rb.useGravity = true;
            if (this.player.collider) this.player.collider.enabled = true;
            this.ui.showEnding3();
        }
    }

    _updateAct4(deltaTime) {
        this.ui.updateStealthHUD(false, 0, 1, this.engine.audioSystem.micEnabled, false);

        if (this.phase === 'act4_tv_twist') {
            const t = this.phaseTimer;
            if (this._twistStep === 0 && t >= 5.2) {
                this._twistStep = 1;
                this.ui.showSubtitle(`[ДИКТОР ТВ]: «${this._tvLine2}»`, 5600, 'tv');
            } else if (this._twistStep === 1 && t >= 10.8) {
                this._twistStep = 2;
                this.ui.showSubtitle(`[ДИКТОР ТВ]: «${this._tvLine3}»`, 7800, 'tv');

                this.player.controlsLocked = true;
                if (this.player.rb) this.player.rb.velocity.set(0, 0, 0);
                this._twistPlayerStartPos.copy(this.player.transform.position);
                this.player.isCrouching = false;
                this.player.targetEyeHeight = 1.54;

                if (this.world.doors?.hall && !this.world.doors.hall.isOpen()) {
                    this.world.doors.hall.setOpen(true);
                }
                this.monster.showMidnightEyesInHallway();
                this.engine.renderer.triggerGlitch(1.0);

                this._twistLookTarget.set(0.65, 1.05, 1.08);
                this.player.forcedLookSpeed = 2.2;
                this.player.forcedLookTarget = this._twistLookTarget;

                const a = this.engine.audioSystem;
                for (const [id, entry] of a.activeLoops.entries()) {
                    a.setLoopVolume(id, Math.min(0.02, (entry.baseVolume ?? 0.4) * 0.06), 2.8);
                }
            }

            if (this._twistStep >= 2) {
                const alignT = Math.min(1, (t - 10.8) / 1.8);
                const ease = alignT * alignT * (3 - 2 * alignT);
                const px = THREE.MathUtils.lerp(this._twistPlayerStartPos.x, 0.62, ease);
                const pz = THREE.MathUtils.lerp(this._twistPlayerStartPos.z, 0.22, ease);
                this.player.transform.position.set(px, 0, pz);
                if (this.player.rb) this.player.rb.position.set(px, 0, pz);

                this._twistLookTarget.lerp(new THREE.Vector3(3.0, 1.56, 1.55), Math.min(1, deltaTime * 1.4));

                const ttsBusy = (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking);
                if (t >= 16.5 && !ttsBusy) {
                    this._twistSpeechDoneElapsed += deltaTime;
                } else {
                    this._twistSpeechDoneElapsed = 0;
                }
                if ((t >= 17.5 && this._twistSpeechDoneElapsed >= 1.2) || t >= 23.0) {
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
                const p1 = { x: 1.0, z: -1.6 };
                const p2 = { x: 0.92, z: -3.5 };
                const p3 = { x: 0.92, z: -4.18 };
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

import * as THREE from 'three';
import { configurePS1Texture } from '../../lumina/index.js';

const WALLPAPER_MAP = {
    '#8d8462': 'wallpaper_living.svg',
    '#6f857b': 'wallpaper_kitchen.svg',
    '#938b6a': 'wallpaper_default.svg'
};

const STREET_SIGN_MAP = {
    'УЛ. ЗАРЕЧНАЯ|← СКВЕР / МАГАЗИН': 'street_sign_zarechnaya.svg',
    'ПР. ЛЕНИНА|← ПРОДУКТЫ 24': 'street_sign_lenina.svg',
    'ТОРГОВАЯ ПЛ.|ПОДЪЕЗД №2 →': 'street_sign_torgovaya.svg',
    'ПОДЪЕЗД №2|КВ. 25–44': 'street_sign_podiezd2.svg',
    'УЛ. ЛЕНИНА|ПРОДУКТЫ 24 ←': 'street_sign_default.svg'
};

const DEPT_SIGN_MAP = {
    'ГАСТРОНОМ': 'dept_sign_gastronom.svg',
    'С НОВЫМ ГОДОМ!': 'dept_sign_newyear.svg',
    'ХЛЕБ · КОНСЕРВЫ': 'dept_sign_bread.svg',
    'ОВОЩИ · ФРУКТЫ': 'dept_sign_veg.svg',
    'МОЛОКО · МЯСО': 'dept_sign_dairy.svg',
    'БАКАЛЕЯ · НАПИТКИ': 'dept_sign_grocery.svg',
    'КОНСЬЕРЖ': 'dept_sign_concierge.svg',
    'СОЮЗПЕЧАТЬ': 'dept_sign_soyuzpechat.svg',
    'ПОДСОБКА': 'dept_sign_storage.svg'
};

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.cache = new Map();
    }

    loadPhoto(key, filename, repeatX = 1, repeatY = 1) {
        const cacheKey = `${key}_${repeatX}_${repeatY}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const tex = this.loader.load(
            `./assets/textures/${filename}`,
            (loaded) => {
                configurePS1Texture(loaded, repeatX, repeatY);
            },
            undefined,
            () => {}
        );
        configurePS1Texture(tex, repeatX, repeatY);
        this.cache.set(cacheKey, tex);
        return tex;
    }

    loadGenerated(filename, repeatX = 1, repeatY = 1) {
        const cacheKey = `gen_${filename}_${repeatX}_${repeatY}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const tex = this.loader.load(
            `./assets/textures/generated/${filename}`,
            (loaded) => {
                configurePS1Texture(loaded, repeatX, repeatY);
            },
            undefined,
            () => {}
        );
        configurePS1Texture(tex, repeatX, repeatY);
        this.cache.set(cacheKey, tex);
        return tex;
    }

    createClockDialTexture() {
        return this.loadGenerated('clock_dial.svg', 1, 1);
    }

    createWallpaperTexture(tint = '#938b6a') {
        const file = WALLPAPER_MAP[String(tint).toLowerCase()] || 'wallpaper_default.svg';
        return this.loadGenerated(file, 1, 1);
    }

    createWoodDarkTexture() {
        return this.loadGenerated('wood_dark.svg', 1, 1);
    }

    createBloodClawTexture() {
        return this.loadGenerated('blood_claw.svg', 1, 1);
    }

    createTableclothTexture() {
        return this.loadGenerated('tablecloth.svg', 1, 1);
    }

    createDirtySnowTexture(repeatX = 1, repeatY = 1) {
        return this.loadGenerated('dirty_snow.svg', repeatX, repeatY);
    }

    createConcreteTexture(repeatX = 1, repeatY = 1) {
        return this.loadGenerated('concrete.svg', repeatX, repeatY);
    }

    createUpholsteryTexture() {
        return this.loadGenerated('upholstery.svg', 1, 1);
    }

    createStairwellWallTexture(repeatX = 1, repeatY = 1) {
        return this.loadGenerated('stairwell_wall.svg', repeatX, repeatY);
    }

    createMeatPlatterTexture() {
        return this.loadGenerated('meat_platter.svg', 1, 1);
    }

    createCrystalTexture() {
        return this.loadGenerated('crystal.svg', 1, 1);
    }

    createMirrorTexture() {
        return this.loadGenerated('mirror.svg', 1, 1);
    }

    createWineLabelTexture() {
        return this.loadGenerated('wine_label.svg', 1, 1);
    }

    createStoreFloorTileTexture() {
        return this.loadGenerated('store_floor_tile.svg', 1, 1);
    }

    createStoreWallLowerTexture() {
        return this.loadGenerated('store_wall_lower.svg', 1, 1);
    }

    createStoreWallUpperTexture() {
        return this.loadGenerated('store_wall_upper.svg', 1, 1);
    }

    createStoreCeilingTexture() {
        return this.loadGenerated('store_ceiling.svg', 1, 1);
    }

    createStoreWoodTexture() {
        return this.loadGenerated('store_wood.svg', 1, 1);
    }

    createStoreEnamelTexture() {
        return this.loadGenerated('store_enamel.svg', 1, 1);
    }

    createStoreSignTexture(text = 'ПРОДУКТЫ 24') {
        return this.loadGenerated('store_sign_produkty24.svg', 1, 1);
    }

    createPeasLabelTexture() {
        return this.loadGenerated('peas_label.svg', 1, 1);
    }

    createMayoLabelTexture() {
        return this.loadGenerated('mayo_label.svg', 1, 1);
    }

    createCuttingBoardTexture() {
        return this.loadGenerated('cutting_board.svg', 1, 1);
    }

    createGroceryBagTexture() {
        return this.loadGenerated('grocery_bag.svg', 1, 1);
    }

    createScalesDialTexture() {
        return this.loadGenerated('scales_dial.svg', 1, 1);
    }

    createRegisterDisplayTexture() {
        return this.loadGenerated('register_display.svg', 1, 1);
    }

    createStoreTileBacksplashTexture() {
        return this.loadGenerated('store_tile_backsplash.svg', 1, 1);
    }

    createStoreDeptSignTexture(text, bg = '#274c6b', fg = '#f7ebd0') {
        const file = DEPT_SIGN_MAP[text] || 'dept_sign_gastronom.svg';
        return this.loadGenerated(file, 1, 1);
    }

    createCondensedMilkLabelTexture() {
        return this.loadGenerated('condensed_milk_label.svg', 1, 1);
    }

    createTeaBoxTexture() {
        return this.loadGenerated('tea_box.svg', 1, 1);
    }

    createMilkCartonTexture() {
        return this.loadGenerated('milk_carton.svg', 1, 1);
    }

    createInteriorDoorTexture() {
        return this.loadGenerated('interior_door.svg', 1, 1);
    }

    createStoreDoorTexture() {
        return this.loadGenerated('store_door.svg', 1, 1);
    }

    createCardboardBoxTexture() {
        return this.loadGenerated('cardboard_box.svg', 1, 1);
    }

    createStoveEnamelTexture() {
        return this.loadGenerated('stove_enamel.svg', 1, 1);
    }

    createFridgeEnamelTexture() {
        return this.loadGenerated('fridge_enamel.svg', 1, 1);
    }

    createCeramicSinkTexture() {
        return this.loadGenerated('ceramic_sink.svg', 1, 1);
    }

    createKitchenCabinetTexture() {
        return this.loadGenerated('kitchen_cabinet.svg', 1, 1);
    }

    createPaintedDoorWoodTexture() {
        return this.loadGenerated('painted_door_wood.svg', 1, 1);
    }

    createMetalBrushedTexture() {
        return this.loadGenerated('metal_brushed.svg', 1, 1);
    }

    createCeilingPlasterTexture(repeatX = 1, repeatY = 1) {
        return this.loadGenerated('ceiling_plaster.svg', repeatX, repeatY);
    }

    createSkinTexture() {
        return this.loadGenerated('skin.svg', 1, 1);
    }

    createHairTexture() {
        return this.loadGenerated('hair.svg', 1, 1);
    }

    createClothTexture() {
        return this.loadGenerated('cloth.svg', 1, 1);
    }

    createAptNumberPlateTexture(numText = '34') {
        const num = String(numText).replace(/[^0-9]/g, '') || '34';
        return this.loadGenerated(`apt_plate_${num}.svg`, 1, 1);
    }

    createAsphaltRoadTexture(repeatX = 14, repeatY = 1) {
        return this.loadGenerated('asphalt_road.svg', repeatX, repeatY);
    }

    createWalkwayTexture(repeatX = 1, repeatY = 5) {
        return this.loadGenerated('walkway.svg', repeatX, repeatY);
    }

    createBarkTexture(isBirch = false) {
        return this.loadGenerated(isBirch ? 'bark_birch.svg' : 'bark_spruce.svg', 1, 2);
    }

    createMissingPostersBoardTexture() {
        return this.loadGenerated('missing_posters_board.svg', 1, 1);
    }

    createIntercomTexture() {
        return this.loadGenerated('intercom.svg', 1, 1);
    }

    createStreetSignTexture(text = 'УЛ. ЛЕНИНА', subtext = 'ПРОДУКТЫ 24 ←') {
        const file = STREET_SIGN_MAP[`${text}|${subtext}`] || 'street_sign_default.svg';
        return this.loadGenerated(file, 1, 1);
    }
}

export default TextureManager;

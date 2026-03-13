/**
 * HouseStyles - Vordefinierte Hausstile fuer die Stadtgebaeude.
 * Portiert aus OverworldGame.prototype.createHouseStyles (overworld.js Zeile ~11636).
 */

/**
 * Gibt ein Array vordefinierter Hausstile zurueck.
 * Jeder Stil enthaelt Farben, Dachtyp und Stockwerke.
 *
 * @returns {Array<{base: string, accent: string, roof: string, highlight: string, balcony: string, metallic: string, roofGarden: boolean, floors: number}>}
 */
export function createHouseStyles() {
    return [
        {
            base: "#c37e61",
            accent: "#f7e3c4",
            roof: "#3a3a3a",
            highlight: "#fcd9a9",
            balcony: "#d97757",
            metallic: "#6f8fa6",
            roofGarden: true,
            floors: 6,
        },
        {
            base: "#d4d0c5",
            accent: "#faf6ec",
            roof: "#494949",
            highlight: "#ffe4ba",
            balcony: "#9fb4c7",
            metallic: "#6d7c8e",
            roofGarden: false,
            floors: 5,
        },
        {
            base: "#8e9faa",
            accent: "#e4eef5",
            roof: "#2d3a4a",
            highlight: "#abd1ff",
            balcony: "#5f7ba6",
            metallic: "#95c4d8",
            roofGarden: true,
            floors: 7,
        },
        {
            base: "#c9a46c",
            accent: "#f0e0c6",
            roof: "#473a2f",
            highlight: "#f6d7b0",
            balcony: "#a7794f",
            metallic: "#8c9aa6",
            roofGarden: false,
            floors: 4,
        },
        {
            base: "#8898aa",
            accent: "#dde7f0",
            roof: "#2f3b4a",
            highlight: "#b7d2f5",
            balcony: "#5b6f87",
            metallic: "#9fb7c9",
            roofGarden: true,
            floors: 8,
        },
        {
            base: "#bda17a",
            accent: "#f3e5c7",
            roof: "#3f3223",
            highlight: "#f9d9a6",
            balcony: "#a87d53",
            metallic: "#7f8c99",
            roofGarden: false,
            floors: 5,
        },
    ];
}
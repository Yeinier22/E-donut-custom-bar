"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Data Labels Formatting Card
 */
class DataLabelsCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Data Labels",
        value: false
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: [
            { displayName: "Auto", value: "auto" },
            { displayName: "Inside end", value: "insideEnd" },
            { displayName: "Outside end", value: "outsideEnd" },
            { displayName: "Inside center", value: "insideCenter" },
            { displayName: "Inside base", value: "insideBase" }
        ],
        value: { displayName: "Auto", value: "auto" }
    });

    fontFamily = new formattingSettings.TextInput({
        name: "fontFamily",
        displayName: "Font Family",
        value: "Segoe UI",
        placeholder: "Segoe UI"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 11
    });

    displayUnit = new formattingSettings.ItemDropdown({
        name: "displayUnit",
        displayName: "Display units",
        items: [
            { displayName: "Auto", value: "auto" },
            { displayName: "None", value: "none" },
            { displayName: "Thousands", value: "thousand" },
            { displayName: "Millions", value: "million" },
            { displayName: "Billions", value: "billion" }
        ],
        value: { displayName: "Auto", value: "auto" }
    });

    valueDecimals = new formattingSettings.NumUpDown({
        name: "valueDecimals",
        displayName: "Value decimal places",
        value: 2
    });

    valueType = new formattingSettings.ItemDropdown({
        name: "valueType",
        displayName: "Value type",
        items: [
            { displayName: "Auto", value: "auto" },
            { displayName: "Number", value: "number" },
            { displayName: "Currency", value: "currency" },
            { displayName: "Percent", value: "percent" }
        ],
        value: { displayName: "Auto", value: "auto" }
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#444444" }
    });

    name: string = "dataLabels";
    displayName: string = "Data Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.position,
        this.fontFamily,
        this.fontSize,
        this.color,
        this.displayUnit,
        this.valueDecimals,
        this.valueType
    ];
}

/**
 * Data Point Formatting Card
 */
class DataPointCardSettings extends FormattingSettingsCard {
    fill = new formattingSettings.ColorPicker({
        name: "fill",
        displayName: "Color",
        value: { value: "" }
    });

    name: string = "dataPoint";
    displayName: string = "Data colors";
    slices: Array<FormattingSettingsSlice> = [this.fill];
}

/**
 * Spacing Formatting Card
 */
class SpacingCardSettings extends FormattingSettingsCard {
    innerRadiusPercent = new formattingSettings.NumUpDown({
        name: "innerRadiusPercent",
        displayName: "Inner radius (%)",
        value: 60
    });

    ringWidthPercent = new formattingSettings.NumUpDown({
        name: "ringWidthPercent",
        displayName: "Ring width (%)",
        value: 35
    });

    centerYPercent = new formattingSettings.NumUpDown({
        name: "centerYPercent",
        displayName: "Vertical position (%)",
        value: 50
    });

    name: string = "spacing";
    displayName: string = "Spacing";
    slices: Array<FormattingSettingsSlice> = [this.innerRadiusPercent, this.ringWidthPercent, this.centerYPercent];
}

/**
 * Legend Formatting Card
 */
class LegendCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show legend",
        value: true
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: [
            { displayName: "Top", value: "top" },
            { displayName: "Bottom", value: "bottom" },
            { displayName: "Left", value: "left" },
            { displayName: "Right", value: "right" }
        ],
        value: { displayName: "Right", value: "right" }
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10
    });

    name: string = "legend";
    displayName: string = "Legend";
    slices: Array<FormattingSettingsSlice> = [this.show, this.position, this.fontSize];
}

/**
 * Label Tuning Formatting Card
 */
class LabelTuningCardSettings extends FormattingSettingsCard {
    lineLength = new formattingSettings.NumUpDown({
        name: "lineLength",
        displayName: "Line Length",
        value: 20
    });

    curveTension = new formattingSettings.NumUpDown({
        name: "curveTension",
        displayName: "Curve Tension",
        value: 0.9
    });

    textSpacing = new formattingSettings.NumUpDown({
        name: "textSpacing",
        displayName: "Text Line Spacing",
        value: 4
    });

    columnOffset = new formattingSettings.NumUpDown({
        name: "columnOffset",
        displayName: "Label Column Offset (px)",
        value: 0
    });

    sidePadding = new formattingSettings.NumUpDown({
        name: "sidePadding",
        displayName: "Side Padding (px)",
        value: 0
    });

    name: string = "labelTuning";
    displayName: string = "Label & Line Tuning";
    slices: Array<FormattingSettingsSlice> = [this.lineLength, this.curveTension, this.textSpacing, this.columnOffset, this.sidePadding];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    dataLabelsCard = new DataLabelsCardSettings();
    dataPointCard = new DataPointCardSettings();
    spacingCard = new SpacingCardSettings();
    legendCard = new LegendCardSettings();
    labelTuningCard = new LabelTuningCardSettings();

    cards = [this.dataLabelsCard, this.dataPointCard, this.spacingCard, this.legendCard, this.labelTuningCard];
}

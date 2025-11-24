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
    value: false,
  });

  labelPlacement = new formattingSettings.ItemDropdown({
    name: "labelPlacement",
    displayName: "Label Placement",
    items: [
      { displayName: "Inside", value: "inside" },
      { displayName: "Outside", value: "outside" },
    ],
    value: { displayName: "Outside", value: "outside" },
  });

  placementMode = new formattingSettings.ItemDropdown({
    name: "placementMode",
    displayName: "Placement Mode",
    items: [
      { displayName: "Align", value: "align" },
      { displayName: "Wrap", value: "wrap" },
    ],
    value: { displayName: "Wrap", value: "wrap" },
  });

  fontFamily = new formattingSettings.TextInput({
    name: "fontFamily",
    displayName: "Font Family",
    value: "Segoe UI",
    placeholder: "Segoe UI",
  });

  fontSize = new formattingSettings.NumUpDown({
    name: "fontSize",
    displayName: "Font Size",
    value: 11,
  });

  displayUnit = new formattingSettings.ItemDropdown({
    name: "displayUnit",
    displayName: "Display units",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "None", value: "none" },
      { displayName: "Thousands", value: "thousand" },
      { displayName: "Millions", value: "million" },
      { displayName: "Billions", value: "billion" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  valueDecimals = new formattingSettings.NumUpDown({
    name: "valueDecimals",
    displayName: "Value decimal places",
    value: 2,
  });

  percentDecimals = new formattingSettings.NumUpDown({
    name: "percentDecimals",
    displayName: "Percent decimal places",
    value: 1,
  });

  valueType = new formattingSettings.ItemDropdown({
    name: "valueType",
    displayName: "Value type",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Number", value: "number" },
      { displayName: "Currency", value: "currency" },
      { displayName: "Percent", value: "percent" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Color",
    value: { value: "#444444" },
  });

  name: string = "dataLabels";
  displayName: string = "Data Labels";
  slices: Array<FormattingSettingsSlice> = [
    this.show,
    this.labelPlacement,
    this.placementMode,
    this.fontFamily,
    this.fontSize,
    this.color,
    this.displayUnit,
    this.valueDecimals,
    this.percentDecimals,
    this.valueType,
  ];
}

/**
 * Data Labels (Drill) Formatting Card
 */
class DataLabelsDrillCardSettings extends FormattingSettingsCard {
  displayUnit = new formattingSettings.ItemDropdown({
    name: "displayUnit",
    displayName: "Display units",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "None", value: "none" },
      { displayName: "Thousands", value: "thousand" },
      { displayName: "Millions", value: "million" },
      { displayName: "Billions", value: "billion" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  valueDecimals = new formattingSettings.NumUpDown({
    name: "valueDecimals",
    displayName: "Value decimal places",
    value: 2,
  });

  percentDecimals = new formattingSettings.NumUpDown({
    name: "percentDecimals",
    displayName: "Percent decimal places",
    value: 1,
  });

  valueType = new formattingSettings.ItemDropdown({
    name: "valueType",
    displayName: "Value type",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Number", value: "number" },
      { displayName: "Currency", value: "currency" },
      { displayName: "Percent", value: "percent" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  name: string = "dataLabelsDrill";
  displayName: string = "Data Labels (Drill)";
  slices: Array<FormattingSettingsSlice> = [
    this.displayUnit,
    this.valueDecimals,
    this.percentDecimals,
    this.valueType,
  ];
}

/**
 * Data Point Formatting Card
 */
class DataPointCardSettings extends FormattingSettingsCard {
  name: string = "dataPoint";
  displayName: string = "Data colors";
  slices: Array<FormattingSettingsSlice> = [];
}

/**
 * Data Point Drill Formatting Card
 */
class DataPointDrillCardSettings extends FormattingSettingsCard {
  name: string = "dataPointDrill";
  displayName: string = "Data colors (Drill)";
  slices: Array<FormattingSettingsSlice> = [];
}

/**
 * Drill Header Formatting Card
 */
class DrillHeaderCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show title",
    value: true,
  });

  name: string = "drillHeader";
  displayName: string = "Drill header";
  slices: Array<FormattingSettingsSlice> = [this.show];
}

/**
 * Hover Style Formatting Card
 */
class HoverStyleCardSettings extends FormattingSettingsCard {
  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Hover color",
    value: { value: "#FFD700" },
  });

  opacity = new formattingSettings.NumUpDown({
    name: "opacity",
    displayName: "Opacity (%)",
    value: 80,
  });

  fillOpacity = new formattingSettings.NumUpDown({
    name: "fillOpacity",
    displayName: "Fill Opacity (%)",
    value: 90,
  });

  borderOpacity = new formattingSettings.NumUpDown({
    name: "borderOpacity",
    displayName: "Border Opacity (%)",
    value: 100,
  });

  duration = new formattingSettings.NumUpDown({
    name: "duration",
    displayName: "Transition duration (ms)",
    value: 200,
  });

  easing = new formattingSettings.ItemDropdown({
    name: "easing",
    displayName: "Easing",
    items: [
      { displayName: "Linear", value: "linear" },
      { displayName: "cubicOut", value: "cubicOut" },
      { displayName: "elasticOut", value: "elasticOut" },
    ],
    value: { displayName: "cubicOut", value: "cubicOut" },
  });

  borderColor = new formattingSettings.ColorPicker({
    name: "borderColor",
    displayName: "Border Color",
    value: { value: "#333333" },
  });

  borderWidth = new formattingSettings.NumUpDown({
    name: "borderWidth",
    displayName: "Border Width (px)",
    value: 2,
  });

  expandX = new formattingSettings.NumUpDown({
    name: "expandX",
    displayName: "Horizontal Overshoot (px)",
    value: 0,
  });

  expandY = new formattingSettings.NumUpDown({
    name: "expandY",
    displayName: "Vertical Overshoot (px)",
    value: 0,
  });

  name: string = "hoverStyle";
  displayName: string = "Hover Style";
  slices: Array<FormattingSettingsSlice> = [
    this.color,
    this.opacity,
    this.fillOpacity,
    this.borderOpacity,
    this.duration,
    this.easing,
    this.borderColor,
    this.borderWidth,
    this.expandX,
    this.expandY,
  ];
}

/**
 * Selection Style Formatting Card
 */
class SelectionStyleCardSettings extends FormattingSettingsCard {
  color = new formattingSettings.ColorPicker({
    name: "color",
    displayName: "Fill color",
    value: { value: "#FF6B6B" },
  });

  borderColor = new formattingSettings.ColorPicker({
    name: "borderColor",
    displayName: "Border color",
    value: { value: "#FF0000" },
  });

  borderWidth = new formattingSettings.NumUpDown({
    name: "borderWidth",
    displayName: "Border width",
    value: 3,
  });

  opacity = new formattingSettings.NumUpDown({
    name: "opacity",
    displayName: "Opacity (%)",
    value: 85,
  });

  name: string = "selectionStyle";
  displayName: string = "Selection Style";
  slices: Array<FormattingSettingsSlice> = [
    this.color,
    this.borderColor,
    this.borderWidth,
    this.opacity,
  ];
}

/**
 * Spacing Formatting Card
 */
class SpacingCardSettings extends FormattingSettingsCard {
  innerRadiusPercent = new formattingSettings.NumUpDown({
    name: "innerRadiusPercent",
    displayName: "Inner radius (%)",
    value: 60,
  });

  ringWidthPercent = new formattingSettings.NumUpDown({
    name: "ringWidthPercent",
    displayName: "Ring width (%)",
    value: 35,
  });

  centerYPercent = new formattingSettings.NumUpDown({
    name: "centerYPercent",
    displayName: "Vertical position (%)",
    value: 50,
  });

  name: string = "spacing";
  displayName: string = "Spacing";
  slices: Array<FormattingSettingsSlice> = [
    this.innerRadiusPercent,
    this.ringWidthPercent,
    this.centerYPercent,
  ];
}

/**
 * Legend Formatting Card
 */
class LegendCardSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({
    name: "show",
    displayName: "Show legend",
    value: true,
  });

  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { displayName: "Top", value: "top" },
      { displayName: "Bottom", value: "bottom" },
      { displayName: "Left", value: "left" },
      { displayName: "Right", value: "right" },
    ],
    value: { displayName: "Right", value: "right" },
  });

  fontSize = new formattingSettings.NumUpDown({
    name: "fontSize",
    displayName: "Font Size",
    value: 10,
  });

  name: string = "legend";
  displayName: string = "Legend";
  slices: Array<FormattingSettingsSlice> = [
    this.show,
    this.position,
    this.fontSize,
  ];
}

/**
 * Label Tuning Formatting Card
 */
class LabelTuningCardSettings extends FormattingSettingsCard {
  // Line Style (Straight or Curved)
  lineStyle = new formattingSettings.ItemDropdown({
    name: "lineStyle",
    displayName: "Line Style",
    items: [
      { displayName: "Straight", value: "straight" },
      { displayName: "Curved", value: "curved" },
    ],
    value: { displayName: "Straight", value: "straight" },
  });

  curveFactor = new formattingSettings.NumUpDown({
    name: "curveFactor",
    displayName: "Curve Intensity",
    value: 0.4,
  });

  lineLengthMode = new formattingSettings.ItemDropdown({
    name: "lineLengthMode",
    displayName: "Line Length Mode",
    items: [
      { displayName: "All same", value: "all" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "All same", value: "all" },
  });

  lineLength = new formattingSettings.NumUpDown({
    name: "lineLength",
    displayName: "Line Length",
    value: 20,
  });

  // Line Angle Controls
  lineAngleMode = new formattingSettings.ItemDropdown({
    name: "lineAngleMode",
    displayName: "Line Angle Mode",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  // Individual angle controls (in degrees, -90 to +90)
  lineAngle_0 = new formattingSettings.NumUpDown({
    name: "lineAngle_0",
    displayName: "Category 0 Angle (°)",
    value: 0,
  });

  lineAngle_1 = new formattingSettings.NumUpDown({
    name: "lineAngle_1",
    displayName: "Category 1 Angle (°)",
    value: 0,
  });

  lineAngle_2 = new formattingSettings.NumUpDown({
    name: "lineAngle_2",
    displayName: "Category 2 Angle (°)",
    value: 0,
  });

  lineAngle_3 = new formattingSettings.NumUpDown({
    name: "lineAngle_3",
    displayName: "Category 3 Angle (°)",
    value: 0,
  });

  lineAngle_4 = new formattingSettings.NumUpDown({
    name: "lineAngle_4",
    displayName: "Category 4 Angle (°)",
    value: 0,
  });

  lineAngle_5 = new formattingSettings.NumUpDown({
    name: "lineAngle_5",
    displayName: "Category 5 Angle (°)",
    value: 0,
  });

  lineAngle_6 = new formattingSettings.NumUpDown({
    name: "lineAngle_6",
    displayName: "Category 6 Angle (°)",
    value: 0,
  });

  lineAngle_7 = new formattingSettings.NumUpDown({
    name: "lineAngle_7",
    displayName: "Category 7 Angle (°)",
    value: 0,
  });

  lineAngle_8 = new formattingSettings.NumUpDown({
    name: "lineAngle_8",
    displayName: "Category 8 Angle (°)",
    value: 0,
  });

  lineAngle_9 = new formattingSettings.NumUpDown({
    name: "lineAngle_9",
    displayName: "Category 9 Angle (°)",
    value: 0,
  });

  // Vertical Position Controls
  verticalPositionMode = new formattingSettings.ItemDropdown({
    name: "verticalPositionMode",
    displayName: "Vertical Position Mode",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  // Individual line length controls (will be shown/hidden based on mode)
  lineLength_0 = new formattingSettings.NumUpDown({
    name: "lineLength_0",
    displayName: "Category 0 Line Length",
    value: 20,
  });

  lineLength_1 = new formattingSettings.NumUpDown({
    name: "lineLength_1",
    displayName: "Category 1 Line Length",
    value: 20,
  });

  lineLength_2 = new formattingSettings.NumUpDown({
    name: "lineLength_2",
    displayName: "Category 2 Line Length",
    value: 20,
  });

  lineLength_3 = new formattingSettings.NumUpDown({
    name: "lineLength_3",
    displayName: "Category 3 Line Length",
    value: 20,
  });

  lineLength_4 = new formattingSettings.NumUpDown({
    name: "lineLength_4",
    displayName: "Category 4 Line Length",
    value: 20,
  });

  lineLength_5 = new formattingSettings.NumUpDown({
    name: "lineLength_5",
    displayName: "Category 5 Line Length",
    value: 20,
  });

  lineLength_6 = new formattingSettings.NumUpDown({
    name: "lineLength_6",
    displayName: "Category 6 Line Length",
    value: 20,
  });

  lineLength_7 = new formattingSettings.NumUpDown({
    name: "lineLength_7",
    displayName: "Category 7 Line Length",
    value: 20,
  });

  lineLength_8 = new formattingSettings.NumUpDown({
    name: "lineLength_8",
    displayName: "Category 8 Line Length",
    value: 20,
  });

  lineLength_9 = new formattingSettings.NumUpDown({
    name: "lineLength_9",
    displayName: "Category 9 Line Length",
    value: 20,
  });

  // Individual vertical position controls
  verticalOffset_0 = new formattingSettings.NumUpDown({
    name: "verticalOffset_0",
    displayName: "Category 0 Vertical Offset",
    value: 0,
  });

  verticalOffset_1 = new formattingSettings.NumUpDown({
    name: "verticalOffset_1",
    displayName: "Category 1 Vertical Offset",
    value: 0,
  });

  verticalOffset_2 = new formattingSettings.NumUpDown({
    name: "verticalOffset_2",
    displayName: "Category 2 Vertical Offset",
    value: 0,
  });

  verticalOffset_3 = new formattingSettings.NumUpDown({
    name: "verticalOffset_3",
    displayName: "Category 3 Vertical Offset",
    value: 0,
  });

  verticalOffset_4 = new formattingSettings.NumUpDown({
    name: "verticalOffset_4",
    displayName: "Category 4 Vertical Offset",
    value: 0,
  });

  verticalOffset_5 = new formattingSettings.NumUpDown({
    name: "verticalOffset_5",
    displayName: "Category 5 Vertical Offset",
    value: 0,
  });

  verticalOffset_6 = new formattingSettings.NumUpDown({
    name: "verticalOffset_6",
    displayName: "Category 6 Vertical Offset",
    value: 0,
  });

  verticalOffset_7 = new formattingSettings.NumUpDown({
    name: "verticalOffset_7",
    displayName: "Category 7 Vertical Offset",
    value: 0,
  });

  verticalOffset_8 = new formattingSettings.NumUpDown({
    name: "verticalOffset_8",
    displayName: "Category 8 Vertical Offset",
    value: 0,
  });

  verticalOffset_9 = new formattingSettings.NumUpDown({
    name: "verticalOffset_9",
    displayName: "Category 9 Vertical Offset",
    value: 0,
  });

  curveTension = new formattingSettings.NumUpDown({
    name: "curveTension",
    displayName: "Curve Tension",
    value: 0.9,
  });

  textSpacing = new formattingSettings.NumUpDown({
    name: "textSpacing",
    displayName: "Text Line Spacing",
    value: 4,
  });

  columnOffset = new formattingSettings.NumUpDown({
    name: "columnOffset",
    displayName: "Label Column Offset (px)",
    value: 0,
  });

  sidePadding = new formattingSettings.NumUpDown({
    name: "sidePadding",
    displayName: "Side Padding (px)",
    value: 0,
  });

  name: string = "labelTuning";
  displayName: string = "Label & Line Tuning";
  slices: Array<FormattingSettingsSlice> = [
    this.lineStyle,
    this.curveFactor,
    this.lineLengthMode,
    this.lineLength,
    this.lineLength_0,
    this.lineLength_1,
    this.lineLength_2,
    this.lineLength_3,
    this.lineLength_4,
    this.lineLength_5,
    this.lineLength_6,
    this.lineLength_7,
    this.lineLength_8,
    this.lineLength_9,
    this.lineAngleMode,
    this.lineAngle_0,
    this.lineAngle_1,
    this.lineAngle_2,
    this.lineAngle_3,
    this.lineAngle_4,
    this.lineAngle_5,
    this.lineAngle_6,
    this.lineAngle_7,
    this.lineAngle_8,
    this.lineAngle_9,
    this.verticalPositionMode,
    this.verticalOffset_0,
    this.verticalOffset_1,
    this.verticalOffset_2,
    this.verticalOffset_3,
    this.verticalOffset_4,
    this.verticalOffset_5,
    this.verticalOffset_6,
    this.verticalOffset_7,
    this.verticalOffset_8,
    this.verticalOffset_9,
    this.curveTension,
    this.textSpacing,
    this.columnOffset,
    this.sidePadding,
  ];
}

/**
 * Label Tuning (Drill) Formatting Card
 * Nota: Solo UI. No modifica capabilities.
 */
class LabelTuningDrillCardSettings extends FormattingSettingsCard {
  // Line Style (Straight or Curved)
  lineStyle = new formattingSettings.ItemDropdown({
    name: "lineStyle",
    displayName: "Line Style",
    items: [
      { displayName: "Straight", value: "straight" },
      { displayName: "Curved", value: "curved" },
    ],
    value: { displayName: "Straight", value: "straight" },
  });

  curveFactor = new formattingSettings.NumUpDown({
    name: "curveFactor",
    displayName: "Curve Intensity",
    value: 0.4,
  });

  lineLengthMode = new formattingSettings.ItemDropdown({
    name: "lineLengthMode",
    displayName: "Line Length Mode",
    items: [
      { displayName: "All same", value: "all" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "All same", value: "all" },
  });

  lineLength = new formattingSettings.NumUpDown({
    name: "lineLength",
    displayName: "Line Length",
    value: 20,
  });

  // Individual line length controls (will be shown/hidden based on mode)
  lineLength_0 = new formattingSettings.NumUpDown({
    name: "lineLength_0",
    displayName: "Category 0 Line Length",
    value: 20,
  });

  lineLength_1 = new formattingSettings.NumUpDown({
    name: "lineLength_1",
    displayName: "Category 1 Line Length",
    value: 20,
  });

  lineLength_2 = new formattingSettings.NumUpDown({
    name: "lineLength_2",
    displayName: "Category 2 Line Length",
    value: 20,
  });

  lineLength_3 = new formattingSettings.NumUpDown({
    name: "lineLength_3",
    displayName: "Category 3 Line Length",
    value: 20,
  });

  lineLength_4 = new formattingSettings.NumUpDown({
    name: "lineLength_4",
    displayName: "Category 4 Line Length",
    value: 20,
  });

  lineLength_5 = new formattingSettings.NumUpDown({
    name: "lineLength_5",
    displayName: "Category 5 Line Length",
    value: 20,
  });

  lineLength_6 = new formattingSettings.NumUpDown({
    name: "lineLength_6",
    displayName: "Category 6 Line Length",
    value: 20,
  });

  lineLength_7 = new formattingSettings.NumUpDown({
    name: "lineLength_7",
    displayName: "Category 7 Line Length",
    value: 20,
  });

  lineLength_8 = new formattingSettings.NumUpDown({
    name: "lineLength_8",
    displayName: "Category 8 Line Length",
    value: 20,
  });

  lineLength_9 = new formattingSettings.NumUpDown({
    name: "lineLength_9",
    displayName: "Category 9 Line Length",
    value: 20,
  });

  // Line Angle Controls
  lineAngleMode = new formattingSettings.ItemDropdown({
    name: "lineAngleMode",
    displayName: "Line Angle Mode",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  // Individual angle controls (in degrees, -90 to +90)
  lineAngle_0 = new formattingSettings.NumUpDown({
    name: "lineAngle_0",
    displayName: "Category 0 Angle (°)",
    value: 0,
  });

  lineAngle_1 = new formattingSettings.NumUpDown({
    name: "lineAngle_1",
    displayName: "Category 1 Angle (°)",
    value: 0,
  });

  lineAngle_2 = new formattingSettings.NumUpDown({
    name: "lineAngle_2",
    displayName: "Category 2 Angle (°)",
    value: 0,
  });

  lineAngle_3 = new formattingSettings.NumUpDown({
    name: "lineAngle_3",
    displayName: "Category 3 Angle (°)",
    value: 0,
  });

  lineAngle_4 = new formattingSettings.NumUpDown({
    name: "lineAngle_4",
    displayName: "Category 4 Angle (°)",
    value: 0,
  });

  lineAngle_5 = new formattingSettings.NumUpDown({
    name: "lineAngle_5",
    displayName: "Category 5 Angle (°)",
    value: 0,
  });

  lineAngle_6 = new formattingSettings.NumUpDown({
    name: "lineAngle_6",
    displayName: "Category 6 Angle (°)",
    value: 0,
  });

  lineAngle_7 = new formattingSettings.NumUpDown({
    name: "lineAngle_7",
    displayName: "Category 7 Angle (°)",
    value: 0,
  });

  lineAngle_8 = new formattingSettings.NumUpDown({
    name: "lineAngle_8",
    displayName: "Category 8 Angle (°)",
    value: 0,
  });

  lineAngle_9 = new formattingSettings.NumUpDown({
    name: "lineAngle_9",
    displayName: "Category 9 Angle (°)",
    value: 0,
  });

  // Vertical Position Controls
  verticalPositionMode = new formattingSettings.ItemDropdown({
    name: "verticalPositionMode",
    displayName: "Vertical Position Mode",
    items: [
      { displayName: "Auto", value: "auto" },
      { displayName: "Individual", value: "individual" },
    ],
    value: { displayName: "Auto", value: "auto" },
  });

  // Individual vertical position controls
  verticalOffset_0 = new formattingSettings.NumUpDown({
    name: "verticalOffset_0",
    displayName: "Category 0 Vertical Offset",
    value: 0,
  });

  verticalOffset_1 = new formattingSettings.NumUpDown({
    name: "verticalOffset_1",
    displayName: "Category 1 Vertical Offset",
    value: 0,
  });

  verticalOffset_2 = new formattingSettings.NumUpDown({
    name: "verticalOffset_2",
    displayName: "Category 2 Vertical Offset",
    value: 0,
  });

  verticalOffset_3 = new formattingSettings.NumUpDown({
    name: "verticalOffset_3",
    displayName: "Category 3 Vertical Offset",
    value: 0,
  });

  verticalOffset_4 = new formattingSettings.NumUpDown({
    name: "verticalOffset_4",
    displayName: "Category 4 Vertical Offset",
    value: 0,
  });

  verticalOffset_5 = new formattingSettings.NumUpDown({
    name: "verticalOffset_5",
    displayName: "Category 5 Vertical Offset",
    value: 0,
  });

  verticalOffset_6 = new formattingSettings.NumUpDown({
    name: "verticalOffset_6",
    displayName: "Category 6 Vertical Offset",
    value: 0,
  });

  verticalOffset_7 = new formattingSettings.NumUpDown({
    name: "verticalOffset_7",
    displayName: "Category 7 Vertical Offset",
    value: 0,
  });

  verticalOffset_8 = new formattingSettings.NumUpDown({
    name: "verticalOffset_8",
    displayName: "Category 8 Vertical Offset",
    value: 0,
  });

  verticalOffset_9 = new formattingSettings.NumUpDown({
    name: "verticalOffset_9",
    displayName: "Category 9 Vertical Offset",
    value: 0,
  });

  curveTension = new formattingSettings.NumUpDown({
    name: "curveTension",
    displayName: "Curve Tension",
    value: 0.9,
  });

  textSpacing = new formattingSettings.NumUpDown({
    name: "textSpacing",
    displayName: "Text Line Spacing",
    value: 4,
  });

  columnOffset = new formattingSettings.NumUpDown({
    name: "columnOffset",
    displayName: "Label Column Offset (px)",
    value: 0,
  });

  sidePadding = new formattingSettings.NumUpDown({
    name: "sidePadding",
    displayName: "Side Padding (px)",
    value: 0,
  });

  // Importante: El nombre de objeto difiere del global para que pueda persistir aparte si el capabilities lo soporta
  name: string = "labelTuningDrill";
  displayName: string = "Label & Line Tuning (Drill)";
  slices: Array<FormattingSettingsSlice> = [
    this.lineStyle,
    this.lineLengthMode,
    this.lineLength,
    this.lineLength_0,
    this.lineLength_1,
    this.lineLength_2,
    this.lineLength_3,
    this.lineLength_4,
    this.lineLength_5,
    this.lineLength_6,
    this.lineLength_7,
    this.lineLength_8,
    this.lineLength_9,
    this.lineAngleMode,
    this.lineAngle_0,
    this.lineAngle_1,
    this.lineAngle_2,
    this.lineAngle_3,
    this.lineAngle_4,
    this.lineAngle_5,
    this.lineAngle_6,
    this.lineAngle_7,
    this.lineAngle_8,
    this.lineAngle_9,
    this.verticalPositionMode,
    this.verticalOffset_0,
    this.verticalOffset_1,
    this.verticalOffset_2,
    this.verticalOffset_3,
    this.verticalOffset_4,
    this.verticalOffset_5,
    this.verticalOffset_6,
    this.verticalOffset_7,
    this.verticalOffset_8,
    this.verticalOffset_9,
    this.curveTension,
    this.textSpacing,
    this.columnOffset,
    this.sidePadding,
  ];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  dataLabelsCard = new DataLabelsCardSettings();
  dataLabelsDrillCard = new DataLabelsDrillCardSettings();
  dataPointCard = new DataPointCardSettings();
  dataPointDrillCard = new DataPointDrillCardSettings();
  drillHeaderCard = new DrillHeaderCardSettings();
  hoverStyleCard = new HoverStyleCardSettings();
  selectionStyleCard = new SelectionStyleCardSettings();
  spacingCard = new SpacingCardSettings();
  legendCard = new LegendCardSettings();
  labelTuningCard = new LabelTuningCardSettings();
  labelTuningDrillCard = new LabelTuningDrillCardSettings();

  cards = [
    this.dataLabelsCard,
    this.dataLabelsDrillCard,
    this.dataPointCard,
    this.dataPointDrillCard,
    this.drillHeaderCard,
    this.hoverStyleCard,
    this.selectionStyleCard,
    this.spacingCard,
    this.legendCard,
    this.labelTuningCard,
    this.labelTuningDrillCard,
  ];
}

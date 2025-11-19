"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Label Tuning Formatting Card
 */
class LabelTuningCardSettings extends FormattingSettingsCard {
  lineLength = new formattingSettings.NumUpDown({
    name: "lineLength",
    displayName: "Line Length",
    value: 20,
  });

  name: string = "labelTuning";
  displayName: string = "Label & Line Tuning";
  slices: Array<FormattingSettingsSlice> = [
    this.lineLength,
  ];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  labelTuningCard = new LabelTuningCardSettings();

  cards = [
    this.labelTuningCard,
  ];
}

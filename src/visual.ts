/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";

import * as echarts from "echarts";
import powerbi from "powerbi-visuals-api";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import "./../style/visual.less";

export class Visual implements powerbi.extensibility.IVisual {
  private chartContainer: HTMLDivElement;
  private chartInstance: echarts.ECharts;
  private host: powerbi.extensibility.IVisualHost;
  private seriesColors: { [key: string]: string } = {};
  private dataView: powerbi.DataView | undefined;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.chartContainer = document.createElement("div");
    this.chartContainer.style.width = "100%";
    this.chartContainer.style.height = "100%";
    options.element.appendChild(this.chartContainer);
    this.chartInstance = echarts.init(this.chartContainer);
    this.host = options.host;
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
    const dataView = options.dataViews && options.dataViews[0];
    this.dataView = dataView;
    if (!dataView || !dataView.categorical) {
      this.chartInstance.clear();
      return;
    }

    const categorical = dataView.categorical;
    const categoryCols = categorical.categories || [];
    const rowCount = categoryCols[0]?.values?.length || 0;

    // Construir etiquetas del eje X admitiendo múltiples columnas en Category
    const categories = categorical.categories?.[0]?.values || [];

    // Utilidad: normalizar valores a números o null
    const toNumberArray = (arr: any[]) =>
      (arr || []).map((v) =>
        v === null || v === undefined || v === ""
          ? null
          : typeof v === "number"
          ? v
          : Number(v)
      );

    let seriesData: any[] = [];
    let legendNames: string[] = [];

    const valuesCols: any = categorical.values || [];
    const groups = valuesCols?.grouped?.() as any[] | undefined;

    const colorHelper = new ColorHelper((this.host as any).colorPalette, {
      objectName: "dataPoint",
      propertyName: "fill",
    } as any);

    const resolveSeriesColor = (seriesName: string, group?: any): string => {
      const objects: any = this.dataView?.metadata?.objects || {};
      const dataPoint: any = objects["dataPoint"] || {};
      // 1) Color guardado por el panel (metadata.objects.dataPoint[seriesName])
      const userColorMeta: string | undefined = dataPoint?.[seriesName]?.solid?.color
        ?? dataPoint?.[seriesName]?.fill?.solid?.color;
      // 2) Color persistido a nivel de grupo/serie (si el runtime lo envía ahí)
      const userColorGroup: string | undefined = group?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.source?.objects?.dataPoint?.fill?.solid?.color;
      const userColor: string | undefined = userColorMeta ?? userColorGroup;
      const color = userColor
        || this.seriesColors[seriesName]
        || (colorHelper.getColorForSeriesValue(objects, seriesName) as any);
      this.seriesColors[seriesName] = color;
      return color;
    };

    if (Array.isArray(groups) && groups.length > 0) {
      // Con leyenda: una serie por grupo de leyenda; si hay varias medidas en Series, crear una por medida
      const measureCount = groups[0]?.values?.length || 0;
      for (const group of groups) {
        if (measureCount <= 1) {
          const name = group?.name ?? "Group";
          const color = resolveSeriesColor(name, group);
          legendNames.push(name);
          seriesData.push({
            name,
            type: "bar",
            data: toNumberArray(group?.values?.[0]?.values || []),
            label: { show: true, position: "top" },
            itemStyle: { color },
          });
        } else {
          for (const mv of group.values || []) {
            const name = `${group?.name ?? "Group"} · ${
              mv?.source?.displayName ?? "Series"
            }`;
            const color = resolveSeriesColor(name, group);
            legendNames.push(name);
            seriesData.push({
              name,
              type: "bar",
              data: toNumberArray(mv?.values || []),
              label: { show: true, position: "top" },
              itemStyle: { color },
            });
          }
        }
      }
    } else {
      // Sin leyenda: una serie por cada medida seleccionada en Series
      const measures: any[] = (valuesCols as any[]) || [];
      seriesData = measures.map((mv: any, idx: number) => {
        const name = mv?.source?.displayName ?? `Series ${idx + 1}`;
        const color = resolveSeriesColor(name);
        return {
          name,
          type: "bar",
          data: toNumberArray(mv?.values || []),
          label: { show: true, position: "top" },
          itemStyle: { color },
        };
      });
      legendNames = seriesData.map((s) => s.name);
    }

    // Guardas básicas
    if (!categories.length || !seriesData.length) {
      this.chartInstance.clear();
      return;
    }

  const xAxisSettings: any = (dataView.metadata?.objects as any)?.xAxis || {};
  const yAxisSettings: any = (dataView.metadata?.objects as any)?.yAxis || {};
  // X Axis toggles
  const showXAxisLine: boolean = xAxisSettings["showAxisLine"] !== false; // default true
  const showXLabels: boolean = xAxisSettings["showLabels"] !== false; // default true
  let showXGridLines: boolean;
  if (typeof xAxisSettings["showGridLines"] === "boolean") {
    showXGridLines = xAxisSettings["showGridLines"];
  } else {
    showXGridLines = false; // default off for vertical grid lines to avoid clutter
  }
  // Y Axis toggles
  const showYLabels: boolean = yAxisSettings["showLabels"] !== false; // default true
  let showYGridLines: boolean;
  if (typeof yAxisSettings["showGridLines"] === "boolean") {
    showYGridLines = yAxisSettings["showGridLines"];
  } else if (typeof yAxisSettings["showGridlines"] === "boolean") {
    // legacy compatibility
    showYGridLines = yAxisSettings["showGridlines"];
  } else {
    showYGridLines = true; // horizontal grid lines on by default
  }

  const legendSettings: any = (dataView.metadata?.objects as any)?.legend || {};
  const legendPosition: string = legendSettings["position"] || "top";
  const legendAlignment: string = legendSettings["alignment"] || "center"; // left | center | right
  const legendIconSetting: string = legendSettings["iconShape"] || "rect";
  const legendIcon: string = legendIconSetting === "square" ? "rect" : legendIconSetting;

  // Compute legend placement
  const isVertical = (legendPosition === "left" || legendPosition === "right");
  let legendTop: any = undefined;
  let legendBottom: any = undefined;
  let legendLeft: any = undefined;
  let legendRight: any = undefined;

  if (legendPosition === "top" || legendPosition === "bottom") {
    // Use alignment for horizontal positions
    if (legendPosition === "top") legendTop = "5%"; else legendBottom = "5%";
    if (legendAlignment === "left") legendLeft = "2%";
    else if (legendAlignment === "right") legendRight = "2%";
    else legendLeft = "center"; // center
  } else if (legendPosition === "left") {
    legendLeft = "2%";
    legendTop = "5%";
  } else if (legendPosition === "right") {
    legendRight = "2%";
    legendTop = "5%";
  } else if (legendPosition === "topCenter" || legendPosition === "bottomCenter") {
    // Back-compat for previous centered options
    if (legendPosition === "topCenter") legendTop = "5%"; else legendBottom = "5%";
    legendLeft = "center";
  } else if (legendPosition === "bottomRight") {
    legendBottom = "5%";
    legendRight = "2%";
  }

    const option: echarts.EChartsCoreOption = {
      tooltip: { trigger: "axis" },
      legend: {
        type: "plain",
        orient: isVertical ? "vertical" : "horizontal",
        top: legendTop,
        bottom: legendBottom,
        left: legendLeft,
        right: legendRight,
        icon: legendIcon,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { fontSize: 12 },
        data: legendNames
      },
      grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
      xAxis: { type: "category", data: categories, axisLine: { show: showXAxisLine }, axisTick: { show: false }, axisLabel: { show: showXLabels }, splitLine: { show: showXGridLines } },
      yAxis: { type: "value", axisLabel: { show: showYLabels }, splitLine: { show: showYGridLines } },
      series: seriesData,
    };

    /*const option: echarts.EChartsCoreOption = {
  color: ["#3366CC", "#FF66B2", "#91CC75", "#EE6666"], // azul, rosa, verde, rojo (puedes cambiarlo)
  tooltip: { trigger: "axis" },
  legend: { top: "5%", data: legendNames },
  grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
  xAxis: { type: "category", data: categories },
  yAxis: { type: "value", splitLine: { show: false } },
  series: seriesData
};*/

    this.chartInstance.clear();
    this.chartInstance.setOption(option, true);
    this.chartInstance.resize();
  }

  public enumerateObjectInstances(
    options: powerbi.EnumerateVisualObjectInstancesOptions
  ): powerbi.VisualObjectInstanceEnumeration {
    const enumeration: powerbi.VisualObjectInstance[] = [];
  if (options.objectName === "dataPoint") {
      const categorical = this.dataView?.categorical;
      const valuesCols: any = categorical?.values || [];
      const groups = valuesCols?.grouped?.() as any[] | undefined;

      const pushInstance = (name: string, selector?: powerbi.data.Selector) => {
        enumeration.push({
          objectName: "dataPoint",
          displayName: name,
          properties: {
            fill: { solid: { color: this.seriesColors?.[name] ?? "#3366CC" } },
          },
          selector: selector ?? dataViewWildcard.createDataViewWildcardSelector(
            dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
          ),
        });
      };

      if (Array.isArray(groups) && groups.length > 0) {
        const measureCount = groups[0]?.values?.length || 0;
        for (const group of groups) {
          if (measureCount <= 1) {
            const sel = { data: [group.identity] } as any;
            pushInstance(group?.name ?? "Group", sel);
          } else {
            for (const mv of group.values || []) {
              const seriesName = `${group?.name ?? "Group"} · ${mv?.source?.displayName ?? "Series"}`;
              const sel = { data: [group.identity] } as any;
              pushInstance(seriesName, sel);
            }
          }
        }
      } else {
        // Sin leyenda: una serie por medida
        const measures: any[] = (valuesCols as any[]) || [];
        measures.forEach((mv: any, idx: number) => {
          const name = mv?.source?.displayName ?? `Series ${idx + 1}`;
          pushInstance(name);
        });
      }
    }

    if (options.objectName === "yAxis") {
      enumeration.push({
        objectName: "yAxis",
        displayName: "Y Axis",
        properties: {
          showLabels: (this.dataView?.metadata?.objects as any)?.yAxis?.showLabels !== false,
          showGridLines: (this.dataView?.metadata?.objects as any)?.yAxis?.showGridLines !== false
        },
        selector: undefined as any
      });
    }

    if (options.objectName === "xAxis") {
      enumeration.push({
        objectName: "xAxis",
        displayName: "X Axis",
        properties: {
          showAxisLine: (this.dataView?.metadata?.objects as any)?.xAxis?.showAxisLine !== false,
          showLabels: (this.dataView?.metadata?.objects as any)?.xAxis?.showLabels !== false,
          showGridLines: (this.dataView?.metadata?.objects as any)?.xAxis?.showGridLines === true
        },
        selector: undefined as any
      });
    }

    if (options.objectName === "legend") {
      const objects: any = this.dataView?.metadata?.objects || {};
      const position = objects?.legend?.position || "top";
      const alignment = objects?.legend?.alignment || "center";
      const iconShape = objects?.legend?.iconShape || "rect";
      enumeration.push({
        objectName: "legend",
        displayName: "Legend",
        properties: {
          position,
          alignment,
          iconShape
        },
        selector: undefined as any
      });
    }
    return enumeration;
  }

  public destroy() {
    this.chartInstance.dispose();
  }

}


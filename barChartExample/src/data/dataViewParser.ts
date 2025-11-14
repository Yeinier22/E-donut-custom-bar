import powerbi from 'powerbi-visuals-api';
import { ColorHelper } from 'powerbi-visuals-utils-colorutils';
import { dataViewWildcard } from 'powerbi-visuals-utils-dataviewutils';
import { ParsedData } from './dataInterfaces';
import { VisualFormattingSettingsModel } from '../formatting';

export class DataViewParser {
  constructor(
    private host: powerbi.extensibility.IVisualHost,
    private populateFormatting: (modelCtor: any, dv: powerbi.DataView) => VisualFormattingSettingsModel
  ) {}

  public parse(dv: powerbi.DataView | undefined, seriesColors: { [key: string]: string }): ParsedData {
    const empty: ParsedData = {
      categories: [],
      legendNames: [],
      series: [],
      seriesColors: seriesColors,
      formatting: {} as any,
      dataView: dv as any,
      hasData: false
    };
    if (!dv || !dv.categorical) return empty;

    const formatting = this.populateFormatting(VisualFormattingSettingsModel, dv);

    const categorical = dv.categorical;
    const categoryCols = categorical.categories || [];
    const cat1All = categoryCols[0]?.values || [];
    const rowCount = cat1All.length || 0;

    // Aggregate by first category
    const uniqueCat1: any[] = [];
    const idxsByCat1 = new Map<any, number[]>();
    for (let i = 0; i < rowCount; i++) {
      const v = (cat1All as any[])[i];
      if (!idxsByCat1.has(v)) {
        idxsByCat1.set(v, []);
        uniqueCat1.push(v);
      }
      idxsByCat1.get(v)!.push(i);
    }

    const valuesCols: any = categorical.values || [];
    const groups = valuesCols?.grouped?.() as any[] | undefined;

    const colorHelper = new ColorHelper((this.host as any).colorPalette, {
      objectName: 'dataPoint',
      propertyName: 'fill',
    } as any);

    const toNumber = (x: any) => x === null || x === undefined || x === '' ? 0 : (typeof x === 'number' ? x : Number(x));

    const nameCount: Record<string, number> = {};
    const makeUniqueName = (raw: any): string => {
      let base = (raw === null || raw === undefined || String(raw) === '') ? '(Blank)' : String(raw);
      if (nameCount[base] === undefined) { nameCount[base] = 1; return base; }
      nameCount[base] += 1; return `${base} (${nameCount[base]})`;
    };

    const legendNames: string[] = [];
    const series: any[] = [];

    const getUserColorFromMeta = (seriesName: string, group?: any): string | undefined => {
      const objects: any = dv?.metadata?.objects || {};
      const dataPoint: any = objects['dataPoint'] || {};
      const userColorMeta: string | undefined = dataPoint?.[seriesName]?.solid?.color
        ?? dataPoint?.[seriesName]?.fill?.solid?.color;
      const userColorGroup: string | undefined = group?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.objects?.dataPoint?.fill?.solid?.color
        ?? group?.values?.[0]?.source?.objects?.dataPoint?.fill?.solid?.color;
      return userColorMeta ?? userColorGroup;
    };

    const resolveSeriesColor = (seriesName: string, group?: any): string => {
      const userColor = getUserColorFromMeta(seriesName, group);
      const color = userColor || seriesColors[seriesName] || (colorHelper.getColorForSeriesValue(dv?.metadata?.objects as any, seriesName) as any);
      seriesColors[seriesName] = color;
      return color || '#3366CC';
    };

    if (Array.isArray(groups) && groups.length > 0) {
      const measureCount = groups[0]?.values?.length || 0;
      for (const group of groups) {
        if (measureCount <= 1) {
          const name = makeUniqueName(group?.name);
          const color = resolveSeriesColor(name, group);
          legendNames.push(name);
          const srcCol: any = group?.values?.[0] || {};
          const src: any[] = srcCol?.values || [];
          const agg = uniqueCat1.map((c) => {
            const idxs = idxsByCat1.get(c) || [];
            let s = 0; for (const i of idxs) s += toNumber(src[i]);
            return s;
          });
          series.push({ name, type: 'bar', data: agg, itemStyle: { color }, label: {} });
        } else {
          for (const mv of group.values || []) {
            const left = (group?.name === null || group?.name === undefined || String(group?.name) === '') ? '(Blank)' : String(group?.name);
            const right = mv?.source?.displayName ?? 'Series';
            const name = makeUniqueName(`${left} · ${right}`);
            const color = resolveSeriesColor(name, group);
            legendNames.push(name);
            const src: any[] = mv?.values || [];
            const agg = uniqueCat1.map((c) => {
              const idxs = idxsByCat1.get(c) || [];
              let s = 0; for (const i of idxs) s += toNumber(src[i]);
              return s;
            });
            series.push({ name, type: 'bar', data: agg, itemStyle: { color }, label: {} });
          }
        }
      }
    } else {
      const measures: any[] = (valuesCols as any[]) || [];
      for (let idx = 0; idx < measures.length; idx++) {
        const mv: any = measures[idx];
        const name = mv?.source?.displayName ?? `Series ${idx + 1}`;
        const color = resolveSeriesColor(name);
        const src: any[] = mv?.values || [];
        const agg = uniqueCat1.map((c) => {
          const idxs = idxsByCat1.get(c) || [];
          let s = 0; for (const i of idxs) s += toNumber(src[i]);
          return s;
        });
        legendNames.push(name);
        series.push({ name, type: 'bar', data: agg, itemStyle: { color }, label: {} });
      }
    }

    return {
      categories: uniqueCat1,
      legendNames,
      series,
      seriesColors,
      formatting,
      dataView: dv,
      hasData: uniqueCat1.length > 0 && series.length > 0
    };
  }
}

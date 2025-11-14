// Drill handler module: encapsulates drilldown logic and callbacks
// Assumes visual object carries chartInstance, parsed data, and state flags.

import { updateDrillGraphics } from "../interaction/hoverHandlers";
import { buildDrillSelectionIds } from "../interaction/selectionManager";
import { computeYAxisScale } from "../axes/yAxisScale";
import { computeLegendLayout } from "../layout/legendLayout";

export function canDrillDown(visual: any): boolean {
	const dv = visual.dataView;
	const categorical = dv?.categorical;
	const cat1 = categorical?.categories?.[0]?.values || [];
	const cat2 = categorical?.categories?.[1]?.values || [];
	if (!cat1 || cat1.length === 0 || !cat2 || cat2.length === 0) return false;
	if (cat1.length !== cat2.length) return false;
	const uniqueCat2 = new Set(cat2);
	if (uniqueCat2.size <= 1) return false;
	const cat1ToCat2Map = new Map<any, Set<any>>();
	for (let i = 0; i < cat1.length; i++) {
		const c1 = cat1[i];
		const c2 = cat2[i];
		if (!cat1ToCat2Map.has(c1)) cat1ToCat2Map.set(c1, new Set());
		cat1ToCat2Map.get(c1)!.add(c2);
	}
	for (const [, cat2Set] of cat1ToCat2Map) {
		if (cat2Set.size > 1) return true;
	}
	return false;
}

export function canCategoryDrillDown(visual: any, categoryLabel: any, categoryKey?: any): boolean {
	if (!canDrillDown(visual)) return false;
	const dv = visual.dataView;
	const categorical = dv?.categorical;
	const cat1 = categorical?.categories?.[0]?.values || [];
	const cat2 = categorical?.categories?.[1]?.values || [];
	const matchesCategory = (value: any) => {
		if (categoryKey !== undefined && categoryKey !== null) {
			if (value === categoryKey) return true;
			const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function") ? value.valueOf() : value;
			const keyPrimitive = (categoryKey !== null && categoryKey !== undefined && typeof categoryKey.valueOf === "function") ? categoryKey.valueOf() : categoryKey;
			if (valuePrimitive === keyPrimitive) return true;
			if (String(valuePrimitive) === String(keyPrimitive)) return true;
		}
		if (value === categoryLabel) return true;
		if (value !== null && value !== undefined && categoryLabel !== null && categoryLabel !== undefined) return String(value) === String(categoryLabel);
		return false;
	};
	const matchingIndices: number[] = [];
	for (let i = 0; i < cat1.length; i++) if (matchesCategory(cat1[i])) matchingIndices.push(i);
	if (matchingIndices.length === 0) return false;
	const subcategories = new Set<any>();
	for (const idx of matchingIndices) subcategories.add(cat2[idx]);
	return subcategories.size > 1;
}

export function buildDrillForCategory(visual: any, clickedCategoryLabel: any, categoryKey?: any): { categories: any[]; series: any[] } {
	const dv = visual.dataView;
	const categorical = dv?.categorical;
	const cat1 = categorical?.categories?.[0]?.values || [];
	const cat2 = categorical?.categories?.[1]?.values || [];
	if (!cat2 || cat2.length === 0) return { categories: [], series: [] };

	const valuesCols: any = categorical?.values || [];
	const groups = valuesCols?.grouped?.() as any[] | undefined;
	const rowCount = (cat1 as any[]).length;
	const idxs: number[] = [];
	const matchesCategory = (value: any) => {
		if (categoryKey !== undefined && categoryKey !== null) {
			if (value === categoryKey) return true;
			const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function") ? value.valueOf() : value;
			const keyPrimitive = (categoryKey !== null && categoryKey !== undefined && typeof categoryKey.valueOf === "function") ? categoryKey.valueOf() : categoryKey;
			if (valuePrimitive === keyPrimitive) return true;
			if (String(valuePrimitive) === String(keyPrimitive)) return true;
		}
		if (value === clickedCategoryLabel) return true;
		if (value !== null && value !== undefined && clickedCategoryLabel !== null && clickedCategoryLabel !== undefined) return String(value) === String(clickedCategoryLabel);
		return false;
	};
	for (let i = 0; i < rowCount; i++) if (matchesCategory((cat1 as any[])[i])) idxs.push(i);
	const cat2Order: any[] = [];
	const seen2 = new Set<any>();
	for (const i of idxs) {
		const v = (cat2 as any[])[i];
		if (!seen2.has(v)) { seen2.add(v); cat2Order.push(v); }
	}
	if (cat2Order.length <= 1) return { categories: [], series: [] };

	const dl: any = (dv?.metadata?.objects as any)?.dataLabels || {};
	const dlShow: boolean = dl["show"] !== false;
	const dlColor: string = (dl["color"] as any)?.solid?.color || "#444";
	const dlFontFamily: string = (dl["fontFamily"] as string) || "Segoe UI";
	const dlFontSize: number = typeof dl["fontSize"] === "number" ? dl["fontSize"] : 12;
	const dlFontStyleSetting: string = (dl["fontStyle"] as string) || "normal";
	const dlFontWeight: any = dlFontStyleSetting === "bold" ? "bold" : "normal";
	const dlFontStyle: any = dlFontStyleSetting === "italic" ? "italic" : "normal";
	const dlTransparency: number = typeof dl["transparency"] === "number" ? dl["transparency"] : 0;
	const dlOpacity: number = Math.max(0, Math.min(1, 1 - (dlTransparency / 100)));
	const dlShowBlankAs: string = (typeof dl["showBlankAs"] === "string") ? dl["showBlankAs"] : "";
	const dlTreatZeroAsBlank: boolean = dl["treatZeroAsBlank"] === true;

	let labelVisibilityValues: any[] | null = null;
	for (let i = 0; i < valuesCols.length; i++) {
		const col = valuesCols[i];
		if (col?.source?.roles?.labelVisibility) { labelVisibilityValues = col.values as any[]; break; }
	}

	const labelVisibilityMapDrill = new Map<any, number>();
	if (labelVisibilityValues && Array.isArray(labelVisibilityValues)) {
		for (const c2Val of cat2Order) {
			let sum = 0;
			for (const i of idxs) if ((cat2 as any[])[i] === c2Val) { const visVal = labelVisibilityValues[i]; sum += (visVal === null || visVal === undefined) ? 0 : Number(visVal); }
			labelVisibilityMapDrill.set(c2Val, sum);
		}
	}

	const labelFormatterDrill = (params: any) => {
		if (labelVisibilityMapDrill.size > 0) {
			const catName = params.name;
			const visValue = labelVisibilityMapDrill.get(catName) ?? 0;
			if (visValue <= 0) return "";
		}
		const v = params?.value;
		if (v === null || v === undefined || v === "") return dlShowBlankAs;
		if (dlTreatZeroAsBlank) {
			const numeric = typeof v === "number" ? v : Number(v);
			if (!Number.isNaN(numeric) && numeric === 0) return dlShowBlankAs ?? "";
		}
		return v as any;
	};

	const toNumber = (x: any) => x === null || x === undefined || x === "" ? 0 : typeof x === "number" ? x : Number(x);

	const buildSeries = (name: string, dataArr: number[], color: string) => ({
		name,
		type: "bar",
		data: dataArr,
		label: { show: dlShow, position: "top", color: dlColor, fontFamily: dlFontFamily, fontSize: dlFontSize, fontStyle: dlFontStyle, fontWeight: dlFontWeight, formatter: labelFormatterDrill, opacity: dlOpacity },
		itemStyle: { color },
	});

	const seriesOut: any[] = [];
	if (Array.isArray(groups) && groups.length > 0) {
		const measureCount = groups[0]?.values?.length || 0;
		for (const group of groups) {
			if (measureCount <= 1) {
				const name = group?.name ?? "Group";
				const col0: any = group?.values?.[0] || {};
				const src = col0?.values || [];
				const high: any[] | undefined = col0?.highlights as any[] | undefined;
				const color = visual.seriesColors?.[name] || "#6688cc";
				const sums = cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]); return s; });
				const sumsHigh = Array.isArray(high) ? cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(high[i]); return s; }) : undefined;
				const useHighlights = Array.isArray(sumsHigh) && (sumsHigh as number[]).some(v => v !== null && v !== undefined && Number(v) !== 0);
				seriesOut.push(buildSeries(name, useHighlights ? (sumsHigh as number[]) : sums, color));
			} else {
				for (const mv of group.values || []) {
					const name = `${group?.name ?? "Group"} · ${mv?.source?.displayName ?? "Series"}`;
					const src = mv?.values || [];
					const high: any[] | undefined = mv?.highlights as any[] | undefined;
					const color = visual.seriesColors?.[name] || "#6688cc";
					const sums = cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]); return s; });
					const sumsHigh = Array.isArray(high) ? cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(high[i]); return s; }) : undefined;
					const useHighlights = Array.isArray(sumsHigh) && (sumsHigh as number[]).some(v => v !== null && v !== undefined && Number(v) !== 0);
					seriesOut.push(buildSeries(name, useHighlights ? (sumsHigh as number[]) : sums, color));
				}
			}
		}
	} else {
		const measures: any[] = (valuesCols as any[]) || [];
		for (const mv of measures) {
			const name = mv?.source?.displayName ?? "Series";
			const src = mv?.values || [];
			const high: any[] | undefined = mv?.highlights as any[] | undefined;
			const color = visual.seriesColors?.[name] || "#6688cc";
			const sums = cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]); return s; });
			const sumsHigh = Array.isArray(high) ? cat2Order.map((c2) => { let s = 0; for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(high[i]); return s; }) : undefined;
			const useHighlights = Array.isArray(sumsHigh) && (sumsHigh as number[]).some(v => v !== null && v !== undefined && Number(v) !== 0);
			seriesOut.push(buildSeries(name, useHighlights ? (sumsHigh as number[]) : sums, color));
		}
	}
	// Return assembled drill series and ordered subcategories
	return { categories: cat2Order, series: seriesOut };
}

export interface DrillViewUIParams {
	hoverDuration: number;
	hoverEasing: string;
	selColor: string;
	selBorderColor: string;
	selBorderWidth: number;
	selOpacity: number;
	expandX: number;
	expandY: number;
	drillHeaderShow: boolean;
}

export function renderDrillView(
	visual: any,
	categoryLabel: string,
	resetSelection: boolean,
	categoryKey: any | undefined,
	ui: DrillViewUIParams
): boolean {
	const built = buildDrillForCategory(visual, categoryLabel, categoryKey);
	if (!built.categories || built.categories.length === 0) return false;

	// Build selection IDs for drill level
	buildDrillSelectionIds(visual, categoryLabel, categoryKey);

	let displayLabel = "";
	if (categoryLabel && categoryLabel !== null && categoryLabel !== undefined) displayLabel = String(categoryLabel);
	else if (categoryKey !== undefined && categoryKey !== null) displayLabel = String(categoryKey);
	else displayLabel = "(No Label)";

	const objects: any = visual.dataView?.metadata?.objects || {};
	const legendSettings: any = objects?.legend || {};
	const legendShow: boolean = legendSettings["show"] !== false;
	const pAll: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
	const pTop: number = typeof legendSettings["paddingTop"] === "number" ? legendSettings["paddingTop"] : pAll;
	const pRight: number = typeof legendSettings["paddingRight"] === "number" ? legendSettings["paddingRight"] : pAll;
	const pBottom: number = typeof legendSettings["paddingBottom"] === "number" ? legendSettings["paddingBottom"] : pAll;
	const pLeft: number = typeof legendSettings["paddingLeft"] === "number" ? legendSettings["paddingLeft"] : pAll;
		const detailMarkerSize: number = typeof legendSettings["markerSize"] === "number" ? legendSettings["markerSize"] : 14;
		const detailFontSize: number = typeof legendSettings["fontSize"] === "number" ? legendSettings["fontSize"] : 12;
	const layout = computeLegendLayout(legendSettings, /*isDrilled*/ true);
	const isVerticalDetail = layout.isVertical;
	const dTop = layout.top;
	const dBottom = layout.bottom;
	const dLeft = layout.left;
	const dRight = layout.right;
		const dGridBottom = layout.gridBottom;

		const drillSeriesWithHover = (built.series || []).map((s: any) => ({
		...s,
		emphasis: { focus: undefined, scale: false },
		stateAnimation: { duration: ui.hoverDuration, easing: ui.hoverEasing },
	}));
	const drillLegendNames = (built.series || []).map((s: any) => s.name);

		// Build Y-axis scale using shared helper
		const yAxisObj: any = (visual.dataView?.metadata?.objects as any)?.yAxis || {};
		const tolRaw = typeof yAxisObj?.scaleAdjustmentTolerance === 'number' ? yAxisObj.scaleAdjustmentTolerance : 0;
		const userSplitsRaw = typeof yAxisObj?.yAxisSplits === 'number' ? yAxisObj.yAxisSplits : 0;
		const valueType = typeof yAxisObj?.valueType === 'string' ? yAxisObj.valueType : 'auto';
		const displayUnits = typeof yAxisObj?.displayUnits === 'string' ? yAxisObj.displayUnits : 'auto';
		const decimalsRaw: any = yAxisObj?.valueDecimals;
		const valueDecimals = (typeof decimalsRaw === 'number') ? String(decimalsRaw) : (typeof decimalsRaw === 'string' ? decimalsRaw : 'auto');

		const scale = computeYAxisScale(built.series || [], {
			tolerance: Math.max(0, Math.min(1, tolRaw)),
			userSplits: userSplitsRaw,
			valueType,
			displayUnits,
			decimals: valueDecimals,
			currencyCode: 'USD'
		});

		const yAxisMin = scale.min;
		const yAxisMax = scale.max;
		const ySplitNumber = scale.splitNumber;
		if (typeof scale.interval === 'number' && userSplitsRaw > 0) (visual as any)._fixedYAxisInterval = scale.interval;

			const drillParams: any = {
		title: { show: ui.drillHeaderShow, text: ui.drillHeaderShow ? `Details for ${displayLabel}` : "", top: "2%" },
		categories: built.categories,
		legendNames: drillLegendNames,
		series: drillSeriesWithHover as any,
		legend: {
			show: legendShow,
			orient: isVerticalDetail ? "vertical" : "horizontal",
			top: dTop,
			bottom: dBottom,
			left: dLeft,
			right: dRight,
			padding: [pTop, pRight, pBottom, pLeft],
				itemWidth: detailMarkerSize,
				itemHeight: detailMarkerSize,
			fontSize: detailFontSize,
				// icon shape handled by legend renderer if present; keep defaults here
		},
		xAxis: { showAxisLine: true, show: true, labelColor: '#666', labelSize: 12, rotate: 0, fontFamily: 'Segoe UI, sans-serif', fontStyle: 'normal', fontWeight: 'normal', showGridLines: false },
				yAxis: { show: true, labelColor: '#666', labelSize: 12, fontFamily: 'Segoe UI, sans-serif', fontStyle: 'normal', fontWeight: 'normal', showGridLines: true, ...(typeof yAxisMin === 'number' ? { min: yAxisMin } : {}), ...(typeof yAxisMax === 'number' ? { max: yAxisMax } : {}), splitNumber: ySplitNumber, ...(visual as any)._fixedYAxisInterval ? { interval: (visual as any)._fixedYAxisInterval } : {}, labelFormatter: scale.labelFormatter },
		gridBottom: dGridBottom,
		animationDuration: 800,
		animationEasing: 'cubicInOut'
	};
	visual.chartBuilder.renderDrill(drillParams);
	visual.isDrilled = true;
	visual.drillCategory = displayLabel;
	visual.drillCategoryKey = categoryKey ?? categoryLabel ?? displayLabel;
	visual.currentCategories = Array.isArray(built.categories) ? [...built.categories] : [];
	visual.hoverGraphic = [];
	if (resetSelection) {
		visual.selectedIndex = null;
		visual.selectionGraphic = [];
	} else if (visual.selectedIndex === null || visual.selectedIndex < 0 || visual.selectedIndex >= visual.currentCategories.length) {
		visual.selectedIndex = null;
		visual.selectionGraphic = [];
	}
	(visual.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
		// Redraw drill-level back/reset overlays; selection band is handled elsewhere
		updateDrillGraphics(visual);
	return true;
}

export function restoreBaseView(visual: any) {
	if (!visual.chartInstance) return;
	visual.selectionManager.clear();
	const objects: any = visual.dataView?.metadata?.objects || {};
	const legendSettings: any = objects?.legend || {};
	const legendShow: boolean = legendSettings["show"] !== false;
	const pos: string = legendSettings["position"] || "top";
	const align: string = legendSettings["alignment"] || "center";
	const extra: number = typeof legendSettings["extraMargin"] === "number" ? legendSettings["extraMargin"] : 0;
	const pAll: number = typeof legendSettings["padding"] === "number" ? legendSettings["padding"] : 0;
	const pTop: number = typeof legendSettings["paddingTop"] === "number" ? legendSettings["paddingTop"] : pAll;
	const pRight: number = typeof legendSettings["paddingRight"] === "number" ? legendSettings["paddingRight"] : pAll;
	const pBottom: number = typeof legendSettings["paddingBottom"] === "number" ? legendSettings["paddingBottom"] : pAll;
	const pLeft: number = typeof legendSettings["paddingLeft"] === "number" ? legendSettings["paddingLeft"] : pAll;
	// reuse legend helpers from visual (they're available via visual module imports)
	const detailShape = visual && visual.normalizeLegendShape ? visual.normalizeLegendShape(legendSettings["iconShape"]) : undefined;
	const detailMarkerSize: number = typeof legendSettings["markerSize"] === "number" ? legendSettings["markerSize"] : 14;
	const detailFontSize: number = typeof legendSettings["fontSize"] === "number" ? legendSettings["fontSize"] : 12;
	const detailIconConfig = visual && visual.legendIconForShape ? visual.legendIconForShape(detailShape, detailMarkerSize) : { width: 14, height: 8 };
	const isVertical = pos === "left" || pos === "right";
	let legendTop: any = undefined, legendBottom: any = undefined, legendLeft: any = undefined, legendRight: any = undefined;
	if (pos === "top") legendTop = `${5 + extra}%`;
	if (pos === "bottom") legendBottom = `${5 + extra}%`;
	if (pos === "left") { legendLeft = "2%"; legendTop = "5%"; }
	if (pos === "right") { legendRight = "2%"; legendTop = "5%"; }
	if (pos === "top" || pos === "bottom") {
		if (align === "left") legendLeft = "2%";
		else if (align === "right") legendRight = "2%";
		else legendLeft = "center";
	}
	const gridBottom = !legendShow ? "3%" : (pos === "bottom" ? `${10 + extra}%` : "3%");
	const baseParams: any = {
		title: { show: false, text: '', top: '5%' },
		categories: visual.baseCategories,
		legendNames: visual.baseLegendNames,
		series: visual.baseSeriesSnapshot,
		legend: {
			show: legendShow,
			orient: isVertical ? 'vertical' : 'horizontal',
			top: legendTop,
			bottom: legendBottom,
			left: legendLeft,
			right: legendRight,
			padding: [pTop, pRight, pBottom, pLeft],
			itemWidth: detailIconConfig.width,
			itemHeight: detailIconConfig.height,
			fontSize: detailFontSize,
			...(detailIconConfig.icon ? { icon: detailIconConfig.icon } : {})
		},
		xAxis: { showAxisLine: true, show: true, labelColor: '#666', labelSize: 12, rotate: 0, fontFamily: 'Segoe UI, sans-serif', fontStyle: 'normal', fontWeight: 'normal', showGridLines: false },
		yAxis: { show: true, labelColor: '#666', labelSize: 12, fontFamily: 'Segoe UI, sans-serif', fontStyle: 'normal', fontWeight: 'normal', showGridLines: true },
		gridBottom
	};
	visual.chartBuilder.renderBase(baseParams);
	visual.isDrilled = false;
	visual.drillCategory = null;
	visual.drillCategoryKey = null;
	visual.hoverGraphic = [];
	visual.selectedIndex = null;
	visual.selectionGraphic = [];
	visual.drillSelectionIds = {};
	visual.currentCategories = Array.isArray(visual.baseCategories) ? [...visual.baseCategories] : [];
	(visual.chartInstance as any).setOption({ graphic: [] }, { replaceMerge: ["graphic"] });
	updateDrillGraphics(visual);
}

export function resetFullView(visual: any) {
	if (visual.isDrilled) {
		visual.selectedIndex = null;
		visual.selectionGraphic = [];
		updateDrillGraphics(visual);
		return;
	}
	restoreBaseView(visual);
}

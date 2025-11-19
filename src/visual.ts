/*
 * Power BI Visual - Pure D3 Implementation
 * Based on example/visual.ts
 */
"use strict";

import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";
import "./../style/visual.less";

// 🎯 Constantes de configuración (idénticas al ejemplo)
const DONUT_CONFIG = {
  INNER_RADIUS_RATIO: 0.4,
  OUTER_RADIUS_RATIO: 0.8,
  LINE_START_RATIO: 0.9,
  MARGIN: 50,
  TEXT_SPACING: 10,
  DEFAULT_LINE_LENGTH: 20,
  MIN_LINE_LENGTH: 0,
  MAX_LINE_LENGTH: 100,
  DEFAULT_WRAP: "wrap" as TextWrapMode,
  DEFAULT_ALIGN: "auto",
  DEFAULT_LINE_MODE: "all" as LineLengthMode
} as const;

// 🎨 Tipos
type TextAlign = "auto" | "left" | "center" | "right";
type TextWrapMode = "wrap" | "single";
type LineLengthMode = "all" | "individual";

interface LineLengthConfig {
  mode: LineLengthMode;
  globalLength: number;
  categoryLengths: Record<string, number>;
}

interface DonutDataPoint {
  category: string;
  value: number;
  percentage: number;
}

interface GeometryHelpers {
  mid: number;
  direction: number;
  outerRadius: number;
  midRadius: number;
}

interface SpacingConfig {
  innerRadiusPercent: number;
  ringWidthPercent: number;
  centerYPercent: number;
}

interface RenderConfig {
  radius: number;
  lineLengthConfig: LineLengthConfig;
  width: number;
  height: number;
  wrap: TextWrapMode;
  spacing: SpacingConfig;
  dataLabels: DataLabelsConfig;
}

interface DataLabelsConfig {
  show: boolean;
  labelPlacement: string;
  placementMode: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontWeight: string;
  opacity: number;
  showBlankAs: string;
  displayUnit: string;
  valueDecimals: number;
  valueType: string;
}

// 🎨 Clase DonutRenderer (copiada exactamente del ejemplo)
class DonutRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    this.svg = svg;
  }

  public render(viewModel: DonutDataPoint[], config: RenderConfig, onSliceClick?: (category: string) => void, onBackClick?: () => void, isDrilled?: boolean, drillCategory?: string): void {
    const { radius, lineLengthConfig, width, height, wrap, spacing, dataLabels } = config;
    
    // Limpiar SVG
    this.svg.selectAll("*").remove();
    
    // Render navigation buttons if in drill mode
    if (isDrilled) {
      this.renderNavigationButtons(width, height, onBackClick, drillCategory);
    }
    
    // Calcular posición Y usando centerYPercent
    const centerY = (height * spacing.centerYPercent) / 100;
    
    const g = this.svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${centerY})`);

    // Configurar generadores D3 exactamente como en el ejemplo
    const pie = d3.pie<any>().value((d: DonutDataPoint) => d.value);
    const arc = d3.arc<d3.PieArcDatum<DonutDataPoint>>()
      .innerRadius(radius * DONUT_CONFIG.INNER_RADIUS_RATIO)
      .outerRadius(radius * DONUT_CONFIG.OUTER_RADIUS_RATIO);
    const color = d3.scaleOrdinal(d3.schemeSet2);

    // Renderizar componentes
    this.renderDonut(g, viewModel, pie, arc, color, onSliceClick);
    
    // Solo renderizar líneas y labels si dataLabels están habilitados y en posición outside
    const isOutside = dataLabels.labelPlacement === "outside";
    if (dataLabels.show && isOutside) {
      this.renderLines(g, viewModel, pie, radius, lineLengthConfig);
      this.renderLabels(g, viewModel, pie, radius, lineLengthConfig, wrap, dataLabels);
    } else if (dataLabels.show && !isOutside) {
      // Renderizar labels inside sin líneas
      this.renderLabelsInside(g, viewModel, pie, dataLabels);
    }
  }

  private renderNavigationButtons(width: number, height: number, onBackClick?: () => void, drillCategory?: string): void {
    // Back button
    const backButton = this.svg.append("g")
      .attr("class", "nav-button")
      .attr("transform", "translate(20, 20)")
      .style("cursor", "pointer")
      .on("click", onBackClick);
    
    backButton.append("text")
      .text("↩ Back")
      .style("font-family", "Segoe UI")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .style("fill", "#555");
    
    // Title showing drill category
    if (drillCategory) {
      this.svg.append("text")
        .text(`Details for ${drillCategory}`)
        .attr("x", width / 2)
        .attr("y", 30)
        .style("text-anchor", "middle")
        .style("font-family", "Segoe UI")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#333");
    }
  }

  public renderNoData(width: number, height: number): void {
    this.svg.selectAll("*").remove();
    this.svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", "#666")
      .text("No data available");
  }

  private getGeometryHelpers(d: d3.PieArcDatum<any>, radius: number): GeometryHelpers {
    const mid = (d.startAngle + d.endAngle) / 2;
    const direction = mid < Math.PI ? 1 : -1;
    return {
      mid,
      direction,
      outerRadius: radius * DONUT_CONFIG.OUTER_RADIUS_RATIO,
      midRadius: radius * DONUT_CONFIG.LINE_START_RATIO
    };
  }

  private calculateLinePoints(helpers: GeometryHelpers, lineLength: number): number[][] {
    const { mid, direction, outerRadius, midRadius } = helpers;
    
    // Punto de inicio: desde el borde exterior del donut
    const startPoint = [
      Math.cos(mid - Math.PI / 2) * outerRadius,
      Math.sin(mid - Math.PI / 2) * outerRadius
    ];
    
    // Punto medio: un poco más afuera para hacer la línea visible
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    // Punto final: se extiende horizontalmente según lineLength
    const finalPoint = [
      midPoint[0] + (lineLength * direction),
      midPoint[1]
    ];

    return [startPoint, midPoint, finalPoint];
  }

  private calculateTextPosition(helpers: GeometryHelpers, lineLength: number): [number, number] {
    const { mid, direction, midRadius } = helpers;
    
    const midPoint = [
      Math.cos(mid - Math.PI / 2) * midRadius,
      Math.sin(mid - Math.PI / 2) * midRadius
    ];
    
    const textX = midPoint[0] + (lineLength * direction) + (DONUT_CONFIG.TEXT_SPACING * direction);
    const textY = midPoint[1];
    
    return [textX, textY];
  }

  private renderDonut(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     arc: d3.Arc<any, d3.PieArcDatum<DonutDataPoint>>,
                     color: d3.ScaleOrdinal<string, string, never>,
                     onSliceClick?: (category: string) => void): void {
    g.selectAll("path")
      .data(pie(viewModel))
      .enter()
      .append("path")
      .attr("d", arc)
      .attr("fill", (d: any) => color(d.data.category))
      .style("stroke", "#fff")
      .style("stroke-width", "2px")
      .style("cursor", onSliceClick ? "pointer" : "default")
      .on("click", onSliceClick ? function(d: any) {
        // En D3 v5, 'd' es el primer parámetro
        onSliceClick(d.data.category);
      } : null);
  }

  private renderLines(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                     viewModel: DonutDataPoint[], 
                     pie: d3.Pie<any, DonutDataPoint>, 
                     radius: number, 
                     lineLengthConfig: LineLengthConfig): void {
    g.selectAll("polyline")
      .data(pie(viewModel))
      .enter()
      .append("polyline")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("points", (d: d3.PieArcDatum<any>) => {
        const helpers = this.getGeometryHelpers(d, radius);
        const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
        const points = this.calculateLinePoints(helpers, lineLength);
        return points.map((p) => p.join(",")).join(" ");
      });
  }

  private renderLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                      viewModel: DonutDataPoint[], 
                      pie: d3.Pie<any, DonutDataPoint>, 
                      radius: number, 
                      lineLengthConfig: LineLengthConfig,
                      wrap: TextWrapMode,
                      dataLabels: DataLabelsConfig): void {
    if (wrap === "wrap") {
      this.renderWrappedLabels(g, pie(viewModel), radius, lineLengthConfig, dataLabels);
    } else {
      this.renderSingleLabels(g, pie(viewModel), radius, lineLengthConfig, dataLabels);
    }
  }

  private renderSingleLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                            pieData: d3.PieArcDatum<DonutDataPoint>[],
                            radius: number,
                            lineLengthConfig: LineLengthConfig,
                            dataLabels: DataLabelsConfig): void {
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      
      g.append("text")
        .text(labelText)
        .attr("transform", `translate(${textX}, ${textY})`)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private renderWrappedLabels(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                             pieData: d3.PieArcDatum<DonutDataPoint>[],
                             radius: number,
                             lineLengthConfig: LineLengthConfig,
                             dataLabels: DataLabelsConfig): void {
    const containerWidth = parseInt(this.svg.attr("width")) || 400;
    const centerX = containerWidth / 2;
    const margin = 10; // Balance entre conservador y funcional
    
    pieData.forEach((d) => {
      const helpers = this.getGeometryHelpers(d, radius);
      const lineLength = this.getLineLengthForCategory(d.data.category, lineLengthConfig);
      const [textX, textY] = this.calculateTextPosition(helpers, lineLength);
      
      const textGroup = g.append("g")
        .attr("transform", `translate(${textX}, ${textY})`);

      // Usar los datos formateados
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      const textAnchor = this.getTextAnchor(d, radius, "auto");
      const absoluteTextX = centerX + textX;
      
      // Verificar si el texto completo cabe
      const fullTextWidth = this.estimateTextWidth(labelText, dataLabels.fontSize);
      
      let willOverflow = false;
      if (helpers.direction < 0) {
        willOverflow = (absoluteTextX - fullTextWidth - margin) < 0;
      } else {
        willOverflow = (absoluteTextX + fullTextWidth + margin) > containerWidth;
      }
      
      // Sistema adaptativo de layout como una web responsive
      this.renderAdaptiveText(textGroup, labelText, textAnchor, dataLabels, helpers, lineLength, absoluteTextX, containerWidth, margin);
    });
  }

  private renderAdaptiveText(textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
                            labelText: string,
                            textAnchor: string,
                            dataLabels: DataLabelsConfig,
                            helpers: GeometryHelpers,
                            lineLength: number,
                            absoluteTextX: number,
                            containerWidth: number,
                            margin: number): void {
    
    // Parsear el texto para extraer componentes
    const parts = this.parseLabel(labelText);
    
    // Calcular anchos disponibles según la dirección
    const availableWidth = helpers.direction < 0 
      ? absoluteTextX - margin
      : containerWidth - absoluteTextX - margin;
    
    // Seleccionar el mejor layout adaptativo según el espacio disponible
    const bestLayout = this.selectBestLayout(parts, dataLabels.fontSize, availableWidth);
    
    // Renderizar el layout seleccionado
    bestLayout.lines.forEach((line, index) => {
      textGroup.append("text")
        .text(line.text)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", line.isBold ? "bold" : dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity)
        .attr("dy", `${-0.3 + (index * 1.2)}em`);
    });
  }

  private parseLabel(labelText: string): { category: string, value: string, percentage: string } {
    // Parsear texto como "Poor: 1.40M (34.13%)" 
    const colonIndex = labelText.indexOf(':');
    const openParenIndex = labelText.lastIndexOf('(');
    const closeParenIndex = labelText.lastIndexOf(')');
    
    if (colonIndex === -1 || openParenIndex === -1) {
      // Si no tiene el formato esperado, devolver como está
      return { category: labelText, value: '', percentage: '' };
    }
    
    const category = labelText.substring(0, colonIndex).trim();
    const value = labelText.substring(colonIndex + 1, openParenIndex).trim();
    const percentage = labelText.substring(openParenIndex + 1, closeParenIndex).trim();
    
    return { category, value, percentage };
  }

  private generateLayoutOptions(parts: { category: string, value: string, percentage: string }, fontSize: number) {
    const layouts = [];
    
    // Layout 1: Todo en una línea
    if (parts.value && parts.percentage) {
      layouts.push({
        lines: [{ text: `${parts.category}: ${parts.value} (${parts.percentage})`, isBold: false }],
        width: this.estimateTextWidth(`${parts.category}: ${parts.value} (${parts.percentage})`, fontSize)
      });
      
      // Layout 2: Categoría arriba, valor y % abajo
      layouts.push({
        lines: [
          { text: `${parts.category}:`, isBold: true },
          { text: `${parts.value} (${parts.percentage})`, isBold: false }
        ],
        width: Math.max(
          this.estimateTextWidth(`${parts.category}:`, fontSize),
          this.estimateTextWidth(`${parts.value} (${parts.percentage})`, fontSize)
        )
      });
      
      // Layout 3: Cada elemento en su línea
      layouts.push({
        lines: [
          { text: `${parts.category}:`, isBold: true },
          { text: parts.value, isBold: false },
          { text: `(${parts.percentage})`, isBold: false }
        ],
        width: Math.max(
          this.estimateTextWidth(`${parts.category}:`, fontSize),
          this.estimateTextWidth(parts.value, fontSize),
          this.estimateTextWidth(`(${parts.percentage})`, fontSize)
        )
      });
    } else {
      // Fallback para textos que no siguen el patrón
      layouts.push({
        lines: [{ text: `${parts.category}${parts.value}${parts.percentage}`, isBold: false }],
        width: this.estimateTextWidth(`${parts.category}${parts.value}${parts.percentage}`, fontSize)
      });
    }
    
    return layouts;
  }

  private generateAdaptiveLayoutOptions(parts: { category: string, value: string, percentage: string }, fontSize: number, maxWidth: number) {
    const adaptiveLayouts = [];
    
    // Generar layouts básicos primero
    const basicLayouts = this.generateLayoutOptions(parts, fontSize);
    
    // Para cada layout básico, crear versiones con wrap interno si es necesario
    basicLayouts.forEach(layout => {
      const adaptedLayout = {
        lines: [] as any[],
        width: 0
      };
      
      layout.lines.forEach(line => {
        const lineWidth = this.estimateTextWidth(line.text, fontSize);
        
        if (lineWidth > maxWidth && line.text.includes(' ')) {
          // Esta línea necesita wrap interno
          const wrappedLines = this.splitTextIntelligent(line.text, maxWidth, fontSize);
          wrappedLines.forEach((wrappedText, index) => {
            adaptedLayout.lines.push({
              text: wrappedText,
              isBold: line.isBold && index === 0 // Solo la primera línea mantiene el bold
            });
          });
          adaptedLayout.width = Math.max(adaptedLayout.width, maxWidth);
        } else {
          // Esta línea cabe completa
          adaptedLayout.lines.push(line);
          adaptedLayout.width = Math.max(adaptedLayout.width, lineWidth);
        }
      });
      
      adaptiveLayouts.push(adaptedLayout);
    });
    
    return adaptiveLayouts;
  }

  private selectBestLayout(parts: { category: string, value: string, percentage: string }, fontSize: number, availableWidth: number) {
    // Generar layouts adaptativos que incluyen wrap interno
    const adaptiveLayouts = this.generateAdaptiveLayoutOptions(parts, fontSize, availableWidth);
    
    // Seleccionar el layout más compacto que quepa en el espacio disponible
    for (const layout of adaptiveLayouts) {
      if (layout.width <= availableWidth) {
        return layout;
      }
    }
    // Si ninguno cabe, usar el último (más dividido y con wrap interno)
    return adaptiveLayouts[adaptiveLayouts.length - 1];
  }

  private renderWrappedText(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                           text: string, 
                           x: number, 
                           y: number, 
                           textAnchor: string, 
                           dataLabels: DataLabelsConfig,
                           radius: number): void {
    // Usar el sistema sofisticado del ejemplo con detección de overflow
    const containerWidth = parseInt(this.svg.attr("width")) || 800;
    const centerX = containerWidth / 2;
    const margin = 5;
    const absoluteTextX = centerX + x;
    
    // Determinar dirección (izquierda o derecha del centro)
    const direction = x >= 0 ? 1 : -1;
    
    // Estimar ancho del texto completo
    const fullTextWidth = this.estimateTextWidth(text, dataLabels.fontSize);
    
    // Verificar si habrá overflow
    let willOverflow = false;
    if (direction < 0) {
      willOverflow = (absoluteTextX - fullTextWidth - margin) < 0;
    } else {
      willOverflow = (absoluteTextX + fullTextWidth + margin) > containerWidth;
    }
    
    // Solo hacer wrap si hay overflow Y el texto tiene espacios
    let lines: string[];
    if (willOverflow && text.includes(' ')) {
      const maxWidth = Math.abs(x) * 1.8; // Ancho máximo basado en distancia del centro
      lines = this.splitTextIntelligent(text, maxWidth, dataLabels.fontSize);
    } else {
      lines = [text]; // Mantener en una línea
    }
    
    // Render cada línea
    const lineHeight = dataLabels.fontSize * 1.2;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      g.append("text")
        .text(line)
        .attr("transform", `translate(${x}, ${startY + index * lineHeight})`)
        .style("text-anchor", textAnchor)
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private renderLabelsInside(g: d3.Selection<SVGGElement, unknown, null, undefined>, 
                           viewModel: DonutDataPoint[], 
                           pie: d3.Pie<any, DonutDataPoint>,
                           dataLabels: DataLabelsConfig): void {
    const pieData = pie(viewModel);
    pieData.forEach((d) => {
      // Calculate centroid for inside labels
      const angle = (d.startAngle + d.endAngle) / 2;
      const radius = 60; // Position inside the donut
      const centroid = [
        Math.cos(angle - Math.PI / 2) * radius,
        Math.sin(angle - Math.PI / 2) * radius
      ];
      
      const labelText = this.formatLabelText(d.data, dataLabels.showBlankAs, dataLabels);
      
      // Apply placement mode for inside labels too
      if (dataLabels.placementMode === "wrap") {
        this.renderWrappedTextInside(g, labelText, centroid[0], centroid[1], dataLabels, radius);
      } else {
        // Align mode - single line text
        g.append("text")
          .text(labelText)
          .attr("transform", `translate(${centroid[0]}, ${centroid[1]})`)
          .style("text-anchor", "middle")
          .style("font-family", dataLabels.fontFamily)
          .style("font-size", `${dataLabels.fontSize}px`)
          .style("font-style", dataLabels.fontStyle)
          .style("font-weight", dataLabels.fontWeight)
          .style("fill", dataLabels.color)
          .style("opacity", dataLabels.opacity);
      }
    });
  }

  private estimateTextWidth(text: string, fontSize: number = 12): number {
    // Estimación más precisa basada en caracteres promedio
    return text.length * fontSize * 0.6;
  }

  private splitTextIntelligent(text: string, maxWidth: number, fontSize: number = 12): string[] {
    // Solo dividir si tiene espacios (múltiples palabras)
    if (!text.includes(' ')) {
      return [text]; // Una sola palabra, no dividir
    }
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.estimateTextWidth(testLine, fontSize);
      
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Si una sola palabra es muy larga, la agregamos completa
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [text];
  }

  private renderWrappedTextInside(g: d3.Selection<SVGGElement, unknown, null, undefined>,
                                 text: string, 
                                 x: number, 
                                 y: number, 
                                 dataLabels: DataLabelsConfig,
                                 radius: number): void {
    // Para labels internos, usar ancho máximo más conservador
    const maxWidth = Math.max(60, Math.floor(radius * 0.8));
    
    // Solo hacer wrap si el texto tiene espacios y es necesario
    let lines: string[];
    if (text.includes(' ') && this.estimateTextWidth(text, dataLabels.fontSize) > maxWidth) {
      lines = this.splitTextIntelligent(text, maxWidth, dataLabels.fontSize);
    } else {
      lines = [text];
    }
    
    // Render cada línea centrada
    const lineHeight = dataLabels.fontSize * 1.1;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      g.append("text")
        .text(line)
        .attr("transform", `translate(${x}, ${startY + index * lineHeight})`)
        .style("text-anchor", "middle")
        .style("font-family", dataLabels.fontFamily)
        .style("font-size", `${dataLabels.fontSize}px`)
        .style("font-style", dataLabels.fontStyle)
        .style("font-weight", dataLabels.fontWeight)
        .style("fill", dataLabels.color)
        .style("opacity", dataLabels.opacity);
    });
  }

  private formatLabelText(dataPoint: DonutDataPoint, showBlankAs: string, dataLabels: DataLabelsConfig): string {
    const category = dataPoint.category === "(Blank)" && showBlankAs ? showBlankAs : dataPoint.category;
    const formattedValue = this.formatValue(dataPoint.value, dataLabels);
    const formattedPercentage = dataPoint.percentage.toFixed(dataLabels.valueDecimals);
    return `${category}: ${formattedValue} (${formattedPercentage}%)`;
  }

  private formatValue(value: number, dataLabels: DataLabelsConfig): string {
    let formattedValue = value;
    let suffix = "";

    // Apply display units
    switch (dataLabels.displayUnit) {
      case "thousand":
        formattedValue = value / 1000;
        suffix = "K";
        break;
      case "million":
        formattedValue = value / 1000000;
        suffix = "M";
        break;
      case "billion":
        formattedValue = value / 1000000000;
        suffix = "B";
        break;
      case "auto":
        if (Math.abs(value) >= 1000000000) {
          formattedValue = value / 1000000000;
          suffix = "B";
        } else if (Math.abs(value) >= 1000000) {
          formattedValue = value / 1000000;
          suffix = "M";
        } else if (Math.abs(value) >= 1000) {
          formattedValue = value / 1000;
          suffix = "K";
        }
        break;
      case "none":
      default:
        formattedValue = value;
        break;
    }

    // Apply decimal places
    const decimals = dataLabels.valueDecimals;
    let valueString = formattedValue.toFixed(decimals);

    // Apply value type formatting
    switch (dataLabels.valueType) {
      case "currency":
        valueString = "$" + valueString;
        break;
      case "percent":
        valueString = valueString + "%";
        break;
      case "number":
      case "auto":
      default:
        // No additional formatting
        break;
    }

    return valueString + suffix;
  }

  private getLineLengthForCategory(category: string, config: LineLengthConfig): number {
    if (config.mode === "individual" && config.categoryLengths[category] !== undefined) {
      return config.categoryLengths[category];
    }
    return config.globalLength;
  }

  private getTextAnchor(d: d3.PieArcDatum<any>, radius: number, align: TextAlign): string {
    if (align !== "auto") return align;
    const mid = (d.startAngle + d.endAngle) / 2;
    return mid < Math.PI ? "start" : "end";
  }
}

// 🎨 Clase Visual Principal
export class Visual implements powerbi.extensibility.visual.IVisual {
  private host: powerbi.extensibility.visual.IVisualHost;
  private container: HTMLElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private renderer: DonutRenderer;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  
  // Drill down state (identical to ECharts version)
  private isDrilled: boolean = false;
  private drillCategory: string | null = null;
  private drillCategoryKey: any = null;
  private dataView: powerbi.DataView | null = null;
  private baseCategories: any[] = [];
  private currentCategories: any[] = [];

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.container = options.element;
    
    // Crear SVG
    this.svg = d3.select(this.container)
      .append("svg")
      .style("width", "100%")
      .style("height", "100%");
    
    this.renderer = new DonutRenderer(this.svg);
    this.formattingSettingsService = new FormattingSettingsService();
    this.formattingSettings = new VisualFormattingSettingsModel();
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    const dataView = options.dataViews && options.dataViews[0];
    this.dataView = dataView;
    
    if (!dataView || !dataView.categorical) {
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
      return;
    }

    // Actualizar configuraciones de formato
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

    // Actualizar tamaño del SVG
    this.svg
      .attr("width", options.viewport.width)
      .attr("height", options.viewport.height);

    // Procesar datos
    const viewModel = this.createViewModel(dataView);
    if (!viewModel || viewModel.length === 0) {
      this.renderer.renderNoData(options.viewport.width, options.viewport.height);
      return;
    }

    // Configurar renderizado con spacing settings
    const spacingConfig = this.getSpacingConfig(dataView);
    const radius = Math.min(options.viewport.width, options.viewport.height) / 2 - DONUT_CONFIG.MARGIN;
    const lineLengthConfig = this.getLineLengthConfig(dataView, viewModel);
    
    const dataLabelsConfig = this.getDataLabelsConfig(dataView, this.isDrilled);
    
    const config: RenderConfig = {
      radius,
      lineLengthConfig,
      width: options.viewport.width,
      height: options.viewport.height,
      wrap: DONUT_CONFIG.DEFAULT_WRAP,
      spacing: spacingConfig,
      dataLabels: dataLabelsConfig
    };

    // Save base state if not drilled (like ECharts version)
    if (!this.isDrilled) {
      const categories = dataView.categorical.categories[0].values;
      this.baseCategories = [];
      const seen = new Set();
      for (const cat of categories) {
        if (!seen.has(cat)) {
          seen.add(cat);
          this.baseCategories.push(cat);
        }
      }
      this.currentCategories = [...this.baseCategories];
    }
    
    // Always enable click when not drilled (like ECharts version)
    const onSliceClick = !this.isDrilled ? (category: string) => {
      // Find the category key (exact match logic from ECharts)
      const clickedIndex = this.currentCategories.indexOf(category);
      const clickedKey = clickedIndex >= 0 && this.baseCategories && clickedIndex < this.baseCategories.length
        ? this.baseCategories[clickedIndex]
        : category;
      
      // Execute drill down (identical to renderDrillView logic)
      const drillData = this.buildDrillData(dataView, category);
      if (drillData && drillData.length > 0) {
        this.isDrilled = true;
        this.drillCategory = category;
        this.drillCategoryKey = clickedKey;
        this.currentCategories = drillData.map(d => d.category);
        this.update(options); // Re-render with drill data
      }
    } : undefined;
    
    const onBackClick = this.isDrilled ? () => {
      this.isDrilled = false;
      this.drillCategory = null;
      this.drillCategoryKey = null;
      this.currentCategories = [...this.baseCategories];
      this.update(options); // Re-render with main data
    } : undefined;

    // Renderizar
    this.renderer.render(viewModel, config, onSliceClick, onBackClick, this.isDrilled, this.drillCategory);
  }

  private createViewModel(dataView: powerbi.DataView): DonutDataPoint[] {
    const categorical = dataView.categorical;
    if (!categorical || !categorical.categories || !categorical.values) {
      return [];
    }

    // Check if we have two category levels for drill down
    const hasSecondCategory = categorical.categories && categorical.categories.length > 1;
    
    if (this.isDrilled && hasSecondCategory && this.drillCategory) {
      // Build drill down data (second level)
      return this.buildDrillData(dataView, this.drillCategory);
    } else {
      // Build main level data (first category)
      return this.buildMainData(dataView);
    }
  }

  private buildMainData(dataView: powerbi.DataView): DonutDataPoint[] {
    const categorical = dataView.categorical;
    const cat1Values = categorical.categories[0].values;
    const allValues = categorical.values[0].values;
    
    // Aggregate by first category (same logic as ECharts version)
    const categoryTotals = new Map<any, number>();
    
    for (let i = 0; i < cat1Values.length; i++) {
      const category = cat1Values[i];
      const rawValue = allValues[i];
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      
      if (!isNaN(value) && isFinite(value)) {
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + value);
      }
    }
    
    // Get unique categories in order of appearance
    const uniqueCategories: any[] = [];
    const seen = new Set();
    for (const cat of cat1Values) {
      if (!seen.has(cat)) {
        seen.add(cat);
        uniqueCategories.push(cat);
      }
    }
    
    // Calculate total for percentages
    let total = 0;
    categoryTotals.forEach(value => total += value);
    
    // Build data points
    const dataPoints: DonutDataPoint[] = [];
    for (const category of uniqueCategories) {
      const categoryName = category == null ? "(Blank)" : String(category);
      const value = categoryTotals.get(category) || 0;
      
      if (value > 0) {
        dataPoints.push({
          category: categoryName,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0
        });
      }
    }

    return dataPoints;
  }

  private buildDrillData(dataView: powerbi.DataView, drillCategory: string): DonutDataPoint[] {
    // Replicate exact logic from buildDrillPieData in ECharts version
    const categorical = dataView.categorical;
    const cat1 = categorical.categories[0].values;
    
    // Check if second category exists
    if (!categorical.categories || categorical.categories.length < 2) {
      return [];
    }
    
    const cat2 = categorical.categories[1].values;
    const valuesCols = categorical.values || [];
    const rowCount = (cat1 as any[]).length;

    // Exact match logic from ECharts version
    const matchesCategory = (value: any) => {
      if (this.drillCategoryKey !== undefined && this.drillCategoryKey !== null) {
        const valuePrimitive = (value !== null && value !== undefined && typeof value.valueOf === "function")
          ? value.valueOf() : value;
        const keyPrimitive = (this.drillCategoryKey !== null && this.drillCategoryKey !== undefined && typeof this.drillCategoryKey.valueOf === "function")
          ? this.drillCategoryKey.valueOf() : this.drillCategoryKey;
        if (valuePrimitive === keyPrimitive || String(valuePrimitive) === String(keyPrimitive)) return true;
      }
      if (value === drillCategory) return true;
      if (value !== null && value !== undefined && drillCategory !== null && drillCategory !== undefined) {
        return String(value) === String(drillCategory);
      }
      return false;
    };

    const idxs: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      if (matchesCategory((cat1 as any[])[i])) idxs.push(i);
    }
    
    const cat2Order: any[] = [];
    const seen = new Set<any>();
    for (const i of idxs) {
      const v = (cat2 as any[])[i];
      if (!seen.has(v)) { seen.add(v); cat2Order.push(v); }
    }

    const toNumber = (x: any) => (x === null || x === undefined || x === "") ? 0 : (typeof x === "number" ? x : Number(x));
    const totals = new Map<any, number>();

    // Helper to add from a column source (exact ECharts logic)
    const addFromSource = (src: any[]) => {
      for (const c2 of cat2Order) {
        let s = 0;
        for (const i of idxs) if ((cat2 as any[])[i] === c2) s += toNumber(src[i]);
        totals.set(c2, (totals.get(c2) || 0) + s);
      }
    };

    const groups = (valuesCols as any)?.grouped?.() as any[] | undefined;
    if (Array.isArray(groups) && groups.length > 0) {
      const measureCount = groups[0]?.values?.length || 0;
      for (const g of groups) {
        if (measureCount <= 1) addFromSource(g?.values?.[0]?.values || []);
        else for (const mv of g.values || []) addFromSource(mv?.values || []);
      }
    } else {
      for (const mv of (valuesCols as any[]) || []) addFromSource(mv?.values || []);
    }

    // Convert to DonutDataPoint format
    const dataPoints: DonutDataPoint[] = [];
    let total = 0;
    totals.forEach(value => total += value);
    
    cat2Order.forEach((name) => {
      const value = totals.get(name) || 0;
      if (value > 0) {
        dataPoints.push({
          category: String(name),
          value,
          percentage: total > 0 ? (value / total) * 100 : 0
        });
      }
    });
    
    return dataPoints;
  }

  private getLineLengthConfig(dataView: powerbi.DataView, viewModel: DonutDataPoint[]): LineLengthConfig {
    const mode = this.getLineLengthMode(dataView);
    const globalLength = this.getGlobalLineLength(dataView);
    const categoryLengths: Record<string, number> = {};

    if (mode === "individual") {
      viewModel.forEach((d, index) => {
        categoryLengths[d.category] = this.getCategoryLineLength(dataView, index);
      });
    }

    return {
      mode,
      globalLength,
      categoryLengths
    };
  }

  private getLineLengthMode(dataView: powerbi.DataView): LineLengthMode {
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.lineLengthMode) {
      const mode = objects.labelTuning.lineLengthMode as string;
      return (mode === "individual" ? "individual" : "all") as LineLengthMode;
    }
    return DONUT_CONFIG.DEFAULT_LINE_MODE;
  }

  private getGlobalLineLength(dataView: powerbi.DataView): number {
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.lineLength) {
      const value = objects.labelTuning.lineLength as number;
      if (typeof value === 'number' && !isNaN(value)) {
        return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
      }
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getCategoryLineLength(dataView: powerbi.DataView, categoryIndex: number): number {
    const propertyName = `lineLength_${categoryIndex}`;
    const objects = dataView?.metadata?.objects;
    if (objects?.labelTuning?.[propertyName]) {
      const value = objects.labelTuning[propertyName] as number;
      if (typeof value === 'number' && !isNaN(value)) {
        return Math.max(DONUT_CONFIG.MIN_LINE_LENGTH, Math.min(DONUT_CONFIG.MAX_LINE_LENGTH, value));
      }
    }
    return DONUT_CONFIG.DEFAULT_LINE_LENGTH;
  }

  private getSpacingConfig(dataView: powerbi.DataView): SpacingConfig {
    const objects = dataView?.metadata?.objects;
    const spacing = objects?.spacing;
    
    return {
      innerRadiusPercent: this.clampValue(spacing?.innerRadiusPercent, 24, 5, 90),
      ringWidthPercent: this.clampValue(spacing?.ringWidthPercent, 58, 4, 90),
      centerYPercent: this.clampValue(spacing?.centerYPercent, 58, 0, 100)
    };
  }

  private clampValue(value: any, defaultValue: number, min: number, max: number): number {
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.max(min, Math.min(max, value));
    }
    return defaultValue;
  }

  private getDataLabelsConfig(dataView: powerbi.DataView, isDrilled: boolean): DataLabelsConfig {
    // Use FormattingSettings values - main dataLabelsCard has all the UI properties
    const dataLabelsCard = this.formattingSettings.dataLabelsCard;
    const drillCard = this.formattingSettings.dataLabelsDrillCard;
    
    return {
      show: dataLabelsCard.show.value,
      labelPlacement: String(dataLabelsCard.labelPlacement.value.value),
      placementMode: String(dataLabelsCard.placementMode.value.value),
      color: dataLabelsCard.color.value.value,
      fontFamily: dataLabelsCard.fontFamily.value,
      fontSize: dataLabelsCard.fontSize.value,
      fontStyle: "normal",
      fontWeight: "normal",  
      opacity: 1,
      showBlankAs: "",
      // Drill-specific formatting (if in drill mode, use drill values for number formatting)
      displayUnit: String(isDrilled ? drillCard.displayUnit.value.value : dataLabelsCard.displayUnit.value.value),
      valueDecimals: isDrilled ? drillCard.valueDecimals.value : dataLabelsCard.valueDecimals.value,
      valueType: String(isDrilled ? drillCard.valueType.value.value : dataLabelsCard.valueType.value.value)
    };
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    // Actualizar visibilidad de slices según el modo
    const isIndividualMode = this.formattingSettings.labelTuningCard.lineLengthMode.value.value === "individual";
    
    // Controlar visibilidad de configuraciones individuales
    this.formattingSettings.labelTuningCard.lineLength.visible = !isIndividualMode;
    
    // Configurar slices individuales con nombres de categorías si están disponibles
    const individualSlices = [
      this.formattingSettings.labelTuningCard.lineLength_0,
      this.formattingSettings.labelTuningCard.lineLength_1,
      this.formattingSettings.labelTuningCard.lineLength_2,
      this.formattingSettings.labelTuningCard.lineLength_3,
      this.formattingSettings.labelTuningCard.lineLength_4,
      this.formattingSettings.labelTuningCard.lineLength_5,
      this.formattingSettings.labelTuningCard.lineLength_6,
      this.formattingSettings.labelTuningCard.lineLength_7,
      this.formattingSettings.labelTuningCard.lineLength_8,
      this.formattingSettings.labelTuningCard.lineLength_9
    ];
    
    individualSlices.forEach((slice, index) => {
      slice.visible = isIndividualMode;
      slice.displayName = `Category ${index} Line Length`;
    });
    
    // Control data labels visibility based on show toggle
    const dataLabelsEnabled = this.formattingSettings.dataLabelsCard.show.value;
    this.formattingSettings.dataLabelsCard.labelPlacement.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.placementMode.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.fontFamily.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.fontSize.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.color.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.displayUnit.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.valueDecimals.visible = dataLabelsEnabled;
    this.formattingSettings.dataLabelsCard.valueType.visible = dataLabelsEnabled;
    
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }
}
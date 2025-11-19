# ECharts Custom Bar (Multi-Series) for Power BI

Custom Power BI visual using Apache ECharts to render multi-series bar charts.

## Buckets
- Category: 1+ columns (supports multiple; labels concatenated)
- Legend: Optional grouping field
- Series: One or more measures (or columns if numeric); with Legend, produces one series per Legend (× per measure if multiple)

## Commands
- Package visual:

```powershell
pbiviz package -v --no-stats
```

- Optional dev server (may require accepting a self-signed cert):

```powershell
pbiviz start -p 8090
```

> If you see a certificate error on Windows where `pwsh` is not recognized, packaging still works. You can test with Power BI Desktop's Developer Visual by importing the `.pbiviz` from `dist`.

## Notes
- Formatting: basic data labels toggle and data color are supported.
- Supports legend-based grouping and multiple measures in Series.

Set-Location -LiteralPath "D:\Data\Custom Graphic\drill_down_donut - Copy"; git show --no-pager --oneline -s 4531a9b; git reset --hard 4531a9b; git status -s -uall; git --no-pager log -n 1 --date=iso --pretty=format:"%h | %ad | %an | %s"

git show --no-pager --oneline -s ef0f4f8; git reset --hard ef0f4f8; git status -s -uall; git --no-pager log -n 1 --date=iso --pretty=format:"%h | %ad | %an | %s"

git --no-pager log -n 10 --date=iso --pretty=format:"%h | %ad | %an | %s"
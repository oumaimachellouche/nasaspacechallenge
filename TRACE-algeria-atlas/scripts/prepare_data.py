#!/usr/bin/env python3
"""Reproducible, offline preparation of the user-supplied regional data.

No remote scientific measurements are downloaded by this script. Native values are
retained in raw CSVs. Published statistics are preserved whenever a matching row
exists; extra views are explicitly identified as recomputed.
"""
from pathlib import Path
from collections import defaultdict
import json, shutil, math, hashlib
import numpy as np
import pandas as pd
from scipy import stats
from compound_lenses import extend

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'public/data/raw'
RAW.mkdir(parents=True,exist_ok=True)
(ROOT/'analysis').mkdir(exist_ok=True)
UPLOADS=Path('/home/user/uploads')
FILES=['algeria_6regions_annual_wide.csv','algeria_6regions_monthly_tidy.csv','step4_driver_attribution.csv','step4_master_trends_6x20.csv','step4_seasonal_trends.csv']
for file in FILES:
    if (UPLOADS/file).exists(): shutil.copy2(UPLOADS/file,RAW/file)
if (UPLOADS/'algeria_41yr_spatial_atlas.png').exists():
    (ROOT/'public/reference').mkdir(exist_ok=True)
    shutil.copy2(UPLOADS/'algeria_41yr_spatial_atlas.png',ROOT/'public/reference/spatial-atlas.png')

m=pd.read_csv(RAW/FILES[1],parse_dates=['date'])
a=pd.read_csv(RAW/FILES[0])
t=pd.read_csv(RAW/FILES[3]); st=pd.read_csv(RAW/FILES[4]); rel=pd.read_csv(RAW/FILES[2])
assert not m.duplicated(['region','variable','date']).any()
regions=[
 {'id':'Oran_West','name':'Oran','subtitle':'West coast','zone':'coast-west','lon':-.7,'lat':35.5,'code':'01'},
 {'id':'Annaba_East','name':'Annaba','subtitle':'East coast','zone':'coast-east','lon':7.6,'lat':36.3,'code':'02'},
 {'id':'Setif_Highlands','name':'Sétif','subtitle':'Highlands','zone':'highlands','lon':5.4,'lat':36.1,'code':'03'},
 {'id':'Djelfa_Steppe','name':'Djelfa','subtitle':'Steppe','zone':'steppe','lon':3.2,'lat':34.65,'code':'04'},
 {'id':'Ouargla_Sahara','name':'Ouargla','subtitle':'Saharan basin','zone':'sahara-basin','lon':5.3,'lat':31.9,'code':'05'},
 {'id':'Tamanrasset_Hoggar','name':'Tamanrasset','subtitle':'Hoggar / deep Sahara','zone':'deep-sahara-hoggar','lon':5.6,'lat':22.9,'code':'06'},
]
for r in regions:
    r['location_note']='Approximate display anchor from the supplied prototype. Extraction footprint not supplied; not a wilaya-wide claim.'

# id, display name, short label, family, display unit, trend unit, group, decimals, definition
rows=[
 ('T2M','Air temperature','Temperature','MERRA-2 · single-level','°C','°C / decade','Atmosphere',2,'Mean air temperature at 2 m, supplied in degrees Celsius.'),
 ('T2MDEW','Dew-point temperature','Dew point','MERRA-2 · single-level','°C','°C / decade','Atmosphere',2,'Temperature at which the air becomes saturated, at 2 m.'),
 ('QV2M','Specific humidity','Humidity','MERRA-2 · single-level','g/kg','g/kg / decade','Atmosphere',2,'Mass of water vapor per mass of moist air at 2 m, as supplied.'),
 ('RH2M_calc','Relative humidity','Relative humidity','Derived · temperature + dew point','%','pp / decade','Atmosphere',2,'Relative humidity derived from monthly temperature and dew point. This is not an independent sensor measurement.'),
 ('VPD_kpa','Atmospheric drying demand','Vapor-pressure deficit','Derived · temperature + dew point','kPa','kPa / decade','Combined lenses',3,'Vapor-pressure deficit: the gap between saturation vapor pressure and actual vapor pressure. It describes atmospheric dryness, not measured soil drought.'),
 ('PRECIP_gpcp','Rainfall · GPCP','GPCP rainfall','GPCP v3.3','mm/day','mm/day / decade','Water cycle',3,'Mean precipitation rate from the supplied GPCP v3.3 series. Annual values are means of monthly rates, not yearly totals.'),
 ('PRECTOTCORR_m2','Rainfall · MERRA-2','MERRA-2 rainfall','MERRA-2 · surface flux','mm/day','mm/day / decade','Water cycle',3,'Bias-corrected total precipitation rate from the supplied MERRA-2 flux series.'),
 ('PRECIP_gpcp_sat','Rainfall · GPCP satellite-only','Satellite-only rain','GPCP v3.3','mm/day','mm/day / decade','Water cycle',3,'Supplied satellite-only GPCP rainfall estimate; useful for comparison with the merged product.'),
 ('PRECIP_gpm','Rainfall · GPM / IMERG','IMERG rainfall','GPM IMERG v07','mm/day','mm/day / decade','Water cycle',3,'Supplied GPM / IMERG precipitation series. Available only from January 2001 through December 2024.'),
 ('EVAP_m2','Evaporation','Evaporation','MERRA-2 · surface flux','mm/day','mm/day / decade','Water cycle',3,'Evaporation rate from the supplied MERRA-2 flux series; not potential evapotranspiration.'),
 ('P_minus_E','Precipitation − evaporation','Atmospheric water balance','Derived · MERRA-2 fluxes','mm/day','mm/day / decade','Combined lenses',3,'Difference between MERRA-2 precipitation and evaporation. This atmospheric budget proxy is not runoff, groundwater storage or crop water availability.'),
 ('AOD_dust','Saharan dust optical depth','Dust optical depth','MERRA-2 · aerosols','AOD','AOD / decade','Aerosols & radiation',4,'Column dust aerosol optical depth. This optical quantity is not surface dust concentration or PM2.5 exposure.'),
 ('AOD_total','Total aerosol optical depth','Total aerosol','MERRA-2 · aerosols','AOD','AOD / decade','Aerosols & radiation',4,'Total column aerosol optical depth in the supplied MERRA-2 aerosol series.'),
 ('DUST_SHARE','Dust share of aerosol','Dust optical share','Derived · two aerosol variables','%','pp / decade','Combined lenses',2,'Monthly dust optical depth divided by total optical depth, multiplied by 100. A share of optical depth—not a share of aerosol mass.'),
 ('HOT_DRY','Hot–dry months','Hot–dry co-occurrence','Exploratory · temperature + rainfall','% of months','pp / decade','Combined lenses',2,'Fraction of months simultaneously above the local calendar-month 90th temperature percentile and below the local 10th GPCP rainfall percentile, using a 1991–2020 reference.'),
 ('CLDTOT','Cloud cover','Cloud cover','MERRA-2 · radiation','%','pp / decade','Aerosols & radiation',2,'Total cloud fraction, supplied as percent. Trend units are percentage points per decade.'),
 ('SWGDN','Surface solar energy','Solar radiation','MERRA-2 · radiation','kWh/m²/day','kWh/m²/day / decade','Aerosols & radiation',3,'Supplied downward shortwave solar energy at the surface. This is not photovoltaic electricity production.'),
 ('SPEED_sfc','Surface wind speed','Surface wind','MERRA-2 · surface flux','m/s','m/s / decade','Wind',2,'Surface wind speed from the flux product. Do not equate this scalar speed with the magnitude of monthly-mean 2 m wind components.'),
 ('U2M','Eastward wind at 2 m','Eastward wind','MERRA-2 · single-level','m/s','m/s / decade','Wind',2,'Eastward component of the supplied monthly-mean wind at 2 m. Negative values indicate a westward component.'),
 ('V2M','Northward wind at 2 m','Northward wind','MERRA-2 · single-level','m/s','m/s / decade','Wind',2,'Northward component of the supplied monthly-mean wind at 2 m. Negative values indicate a southward component.'),
 ('WS2M_vec','2 m mean-vector magnitude','2 m wind vector','Derived · two wind components','m/s','m/s / decade','Wind',2,'Magnitude of the monthly-mean 2 m wind vector, sqrt(U² + V²). It is not the mean of instantaneous wind speeds.'),
 ('GPCP_gauge_wt','GPCP gauge weight · QA flag','Gauge weight','GPCP v3.3','native units*','native units / decade','Quality diagnostic',2,'Unit conflict: tagged fraction in the source CSV, but values range from 22 to 91. Values are retained unchanged; interpretation awaits the original product metadata.'),
]
variables=[]
for x in rows:
    v=dict(zip(['id','name','short','dataset','unit','trendUnit','group','decimals','description'],x))
    v['start']=2001 if v['id']=='PRECIP_gpm' else 1984
    v['end']=2024;v['qa']=v['id']=='GPCP_gauge_wt';v['exploratory']=v['id']=='HOT_DRY'
    variables.append(v)
varmap={v['id']:v for v in variables}
recipes=[
 {'id':'VPD_kpa','title':'Atmospheric drying','subtitle':'Temperature × dew point','inputs':['T2M','T2MDEW'],'formula':'eₛ(T) − eₛ(Tdew), where eₛ(T) = 0.6108 exp[17.27T / (T + 237.3)]','unit':'kPa','description':'A physical combination that measures the air’s saturation deficit. Higher values mean drier air relative to saturation.','caution':'Computed from monthly means. Not soil moisture, crop stress or an independent humidity observation.','icon':'wind'},
 {'id':'P_minus_E','title':'Atmospheric water balance','subtitle':'Rainfall − evaporation','inputs':['PRECTOTCORR_m2','EVAP_m2'],'formula':'P(MERRA-2) − E(MERRA-2)','unit':'mm/day','description':'A physically interpretable difference using two compatible fluxes from the same data family.','caution':'This budget proxy does not measure groundwater, runoff, irrigation needs or usable water.','icon':'droplets'},
 {'id':'DUST_SHARE','title':'Dust’s optical share','subtitle':'Dust aerosol ÷ total aerosol','inputs':['AOD_dust','AOD_total'],'formula':'100 × dust AOD / total AOD','unit':'%','description':'Distinguish changes in total aerosol loading from changes in the dust contribution. Annual values average the monthly ratios.','caution':'Column optical share is not aerosol mass fraction, PM2.5, surface exposure or health risk.','icon':'haze'},
 {'id':'HOT_DRY','title':'Hot–dry co-occurrence','subtitle':'Warm anomalies × low rainfall','inputs':['T2M','PRECIP_gpcp'],'formula':'100 × mean[T > local P90 AND rain < local P10]','unit':'% of months','description':'Count concurrent relative hot and dry monthly conditions. Thresholds are local, calendar-month-specific, and fixed to 1991–2020.','caution':'Exploratory threshold diagnostic, not a validated drought or health index. Binary monthly events and dependence limit simple linear-test interpretation.','icon':'sun-dim'},
]

# Source monthly values, including exact support for two additional lenses.
wide=m.pivot(index=['region','date','year','month'],columns='variable',values='value').reset_index()
wide['DUST_SHARE']=100*wide.AOD_dust/wide.AOD_total
wide['HOT_DRY']=0.0
thresholds={}
for (rid,month),group in wide.groupby(['region','month']):
    baseline=group[group.year.between(1991,2020)]
    hot=float(baseline.T2M.quantile(.9)); dry=float(baseline.PRECIP_gpcp.quantile(.1))
    idx=group.index
    wide.loc[idx,'HOT_DRY']=100*((group.T2M>hot)&(group.PRECIP_gpcp<dry)).astype(float)
    thresholds[f'{rid}|{month}']={'temperature_p90':hot,'rainfall_p10':dry,'baseline_n':len(baseline)}

interface,compound_thresholds=extend(variables,recipes,wide)

assert np.max(np.abs(wide.P_minus_E-(wide.PRECTOTCORR_m2-wide.EVAP_m2)))<1e-12
assert np.max(np.abs(wide.WS2M_vec-np.hypot(wide.U2M,wide.V2M)))<1e-12
assert not (wide.AOD_dust>wide.AOD_total).any()
assert ((t.p_ols<.05)&(t.p_mk_fdr<.05)).equals(t.significant_fdr)

def bh(p):
    p=np.asarray(p,float);order=np.argsort(p);q=np.empty(len(p))
    q[order]=np.minimum(1,np.minimum.accumulate((p[order]*len(p)/np.arange(1,len(p)+1))[::-1])[::-1])
    return q

for window,group in t.groupby('window'):
    assert np.allclose(bh(group.p_mk),group.p_mk_fdr,atol=1e-12)
assert np.allclose(bh(st.p_mk),st.p_mk_fdr,atol=1e-12)

def mk(y):
    y=np.asarray(y);n=len(y);diff=y[np.newaxis,:]-y[:,np.newaxis]
    S=float(np.sign(diff[np.triu_indices(n,1)]).sum())
    _,cnt=np.unique(y,return_counts=True)
    variance=(n*(n-1)*(2*n+5)-sum(c*(c-1)*(2*c+5) for c in cnt if c>1))/18
    z=(S-np.sign(S))/math.sqrt(variance) if variance>0 else 0
    return float(2*stats.norm.sf(abs(z)))

def summarize(years,values):
    x=np.asarray(years,float);y=np.asarray(values,float);n=len(y)
    if n<4:return None
    constant=np.ptp(y)<1e-14
    if constant:
        # scipy versions can report NaN stderr for a constant response. Declare
        # the degenerate OLS case explicitly rather than serializing null CIs.
        return {'n':n,'start':int(x[0]),'end':int(x[-1]),'mean':float(y.mean()),'slope':0.0,'intercept':float(y.mean()),'ciLow':0.0,'ciHigh':0.0,'pOLS':1.0,'pMK':1.0,'senSlope':0.0,'r2':0.0,'residualLag1':0.0,'fitBand':[[int(xx),float(y.mean()),float(y.mean())] for xx in x],'constantSeries':True,'source':'recomputed','qFamily':'6 regional tests for this variable, season and window','qFamilySize':6}
    r=stats.linregress(x,y); crit=float(stats.t.ppf(.975,n-2));xbar=x.mean();sxx=sum((x-xbar)**2)
    fitted=r.intercept+r.slope*x;resid=y-fitted
    sigma=math.sqrt(sum(resid**2)/(n-2));sefit=sigma*np.sqrt(1/n+(x-xbar)**2/sxx)
    sen=float(stats.theilslopes(y,x).slope)
    rho=float(np.corrcoef(resid[:-1],resid[1:])[0,1]) if np.std(resid)>1e-12 else 0
    return {'n':n,'start':int(x[0]),'end':int(x[-1]),'mean':float(y.mean()),'slope':float(r.slope),'intercept':float(r.intercept),'ciLow':float(r.slope-crit*r.stderr),'ciHigh':float(r.slope+crit*r.stderr),'pOLS':1.0 if constant else float(r.pvalue),'pMK':mk(y),'senSlope':sen,'r2':0.0 if constant else float(r.rvalue**2),'residualLag1':rho,'fitBand':[[int(xx),float(ff-crit*ss),float(ff+crit*ss)] for xx,ff,ss in zip(x,fitted,sefit)],'source':'recomputed','qFamily':'6 regional tests for this variable, season and window','qFamilySize':6}

source={}
for row in t.to_dict('records'):
    source[(row['region'],row['variable'],row['window'],'annual')]=row
for row in st.to_dict('records'):
    source[(row['region'],row['variable'],row['window'],row['season'].split('_')[0])]=row

views={}; monthly={}; annual_diff=[]; slope_diff=[]; mk_diff=[]
seasons={'annual':None,'DJF':[12,1,2],'MAM':[3,4,5],'JJA':[6,7,8],'SON':[9,10,11]}
for region in regions:
    rid=region['id'];sub=wide[wide.region==rid];monthly[rid]={}
    for v in variables:
        vid=v['id'];mv=sub[['date','year','month',vid]].dropna()
        monthly[rid][vid]=[[d.strftime('%Y-%m'),float(val)] for d,val in zip(mv.date,mv[vid])]
        for window,start in [('1984-2024',1984),('2001-2024',2001)]:
            if v['start']>start:continue
            windowdata=mv[mv.year.between(start,2024)].copy()
            for season,months in seasons.items():
                ss=windowdata.copy()
                if months:
                    ss=ss[ss.month.isin(months)].copy()
                    ss['analysis_year']=ss.year+(ss.month.eq(12).astype(int) if season=='DJF' else 0)
                    ag=ss.groupby('analysis_year')[vid].agg(['mean','count'])
                    ag=ag[ag['count']==3]
                else:
                    ag=ss.groupby('year')[vid].agg(['mean','count']);ag=ag[ag['count']==12]
                ag=ag[(ag.index>=start)&(ag.index<=2024)]
                years=ag.index.to_numpy();vals=ag['mean'].to_numpy()
                obj=summarize(years,vals)
                if not obj:continue
                key='|'.join([rid,vid,window,season])
                obj['series']=[[int(y),float(val)] for y,val in zip(years,vals)]
                sr=source.get((rid,vid,window,season))
                if sr:
                    slope_diff.append(abs(obj['slope']-sr['ols_slope_yr']));mk_diff.append(abs(obj['pMK']-sr['p_mk']))
                    # Preserve published point estimates, CI, p-values and support rule.
                    obj.update({'slope':float(sr['ols_slope_yr']),'ciLow':float(sr['ci_lo']),'ciHigh':float(sr['ci_hi']),'pOLS':float(sr['p_ols']),'pMK':float(sr['p_mk']),'qMK':float(sr['p_mk_fdr']),'senSlope':float(sr['sen_slope_yr']),'r2':float(sr['r2']),'mean':float(sr['mean_val']),'supported':bool(sr['significant_fdr']),'source':'supplied'})
                    if season=='annual':
                        obj['qFamilySize']=114 if start==1984 else 120
                        obj['qFamily']=f"{obj['qFamilySize']} supplied annual tests within {window}"
                    else:
                        obj['qFamilySize']=480;obj['qFamily']='480 supplied seasonal tests pooled across variables, regions and supplied windows'
                views[key]=obj
                if season=='annual' and vid in a.columns:
                    aa=a[(a.region==rid)&a.year.isin(years)][['year',vid]].dropna()
                    amap=dict(zip(aa.year,aa[vid]));annual_diff.extend(abs(val-amap[y]) for y,val in zip(years,vals))

# New views use a declared six-region family, never silently reuse another q-value.
groups=defaultdict(list)
for key,obj in views.items():
    rid,vid,window,season=key.split('|');groups[(vid,window,season)].append((key,obj))
for group in groups.values():
    qs=bh([obj['pMK'] for _,obj in group])
    for (key,obj),q in zip(group,qs):
        if obj['source']=='recomputed':
            obj['qMK']=float(q);obj['supported']=bool(obj['pOLS']<.05 and q<.05)
            obj['qFamilySize']=len(group);obj['qFamily']=f'{len(group)} regional tests for this metric, season and window (newly computed view)'

# Browser payload: rounding affects presentation copies only; raw inputs are downloadable.
def clean(obj):
    if isinstance(obj,dict):return {k:clean(v) for k,v in obj.items()}
    if isinstance(obj,list):return [clean(v) for v in obj]
    if isinstance(obj,(np.integer,)):return int(obj)
    if isinstance(obj,(float,np.floating)):
        if not np.isfinite(obj):return None
        return float(f'{float(obj):.10g}')
    return obj

warnings=[
 {'id':'footprints','title':'Extraction boundaries not supplied','detail':'The six wilaya polygons are user-approved 2017 administrative display proxies, not verified extraction footprints, point samples or evidence of whole-wilaya data coverage. Original extraction geometry remains unverified.'},
 {'id':'raster','title':'Spatial figure is a reference, not a raster layer','detail':'The uploaded atlas is a PNG. It has not been reverse-engineered into numerical grids. Numeric map readouts come exclusively from regional CSVs.'},
 {'id':'units','title':'Gauge-weight unit conflict','detail':'GPCP_gauge_wt is tagged fraction, while supplied values are 22–91. Values are preserved, flagged and excluded from combined lenses.'},
 {'id':'statistics','title':'Temporal dependence is not corrected','detail':'The supplied OLS and Mann–Kendall methods do not document autocorrelation correction. Residual lag-1 correlation is shown as a diagnostic, not as a correction.'},
 {'id':'associations','title':'Associations are not driver attribution','detail':'The supplied driver table contains annual Pearson correlations. Shared trends and mathematical dependence can contribute to correlations, especially temperature and derived VPD.'},
 {'id':'metadata','title':'Source-family labels, not full extraction provenance','detail':'Dataset-family names and units are supplied, but exact collection IDs, extraction footprints and processing scripts still need to be archived for a reproducible scientific release.'},
]
audit={'monthlyRows':len(m),'sourceVariables':20,'extraLenses':8,'regions':6,'sourceSeries':int(m.groupby(['region','variable']).ngroups),'annualRows':len(a),'annualTrendRows':len(t),'seasonalTrendRows':len(st),'relationshipRows':len(rel),'duplicates':0,'annualMeanMaxError':max(annual_diff),'slopeMaxError':max(slope_diff),'mkMaxError':max(mk_diff),'gpmStart':'2001-01','missingAnnualGPM':int(a.PRECIP_gpm.isna().sum()),'supportRule':'OLS p < 0.05 AND Benjamini–Hochberg-adjusted Mann–Kendall q < 0.05','warnings':warnings}
assert audit['annualMeanMaxError']<1e-11 and audit['slopeMaxError']<1e-10
payload={'schemaVersion':1,'title':'TRACE · Algeria Earth System Atlas','period':[1984,2024],'baseline':[1991,2020],'regions':regions,'variables':variables,'recipes':recipes,'monthly':monthly,'views':views,'providedRelationships':rel.to_dict('records'),'hotDryThresholds':thresholds,'audit':audit,'sources':{'boundary':'Natural Earth 1:10m, public domain','boundaryURL':'https://www.naturalearthdata.com/','imagery':'NASA GIBS Blue Marble (context only, not a scientific layer)','imageryURL':'https://gibs.earthdata.nasa.gov/','terrain':'Esri World Elevation, when available; Cesium ion optional','terrainURL':'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'}}
input_files=[{'filename':file,'sha256':hashlib.sha256((RAW/file).read_bytes()).hexdigest(),'bytes':(RAW/file).stat().st_size,'url':f'/data/raw/{file}'} for file in FILES]
payload['interface']=interface
payload['compoundThresholds']=compound_thresholds
payload['sources']['inputFiles']=input_files
payload['sources']['regionalDisplay']=json.loads((ROOT/'public/data/wilaya-display-metadata.json').read_text())
payload['sources']['preparation']={'script':'scripts/prepare_data.py','algorithmVersion':'trace-prep-2','numericSerialization':'10 significant digits; untouched source CSVs retain original precision'}
(ROOT/'analysis/source-manifest.json').write_text(json.dumps(input_files,indent=2))
path=ROOT/'public/data/atlas.json';path.write_text(json.dumps(clean(payload),separators=(',',':'),ensure_ascii=False))
(ROOT/'analysis/validation.json').write_text(json.dumps(clean(audit),indent=2,ensure_ascii=False))
print(json.dumps(clean({k:v for k,v in audit.items() if k!='warnings'}),indent=2))
print(f'{len(views)} analysis views; {path.stat().st_size/1024:.0f} KB browser payload.')

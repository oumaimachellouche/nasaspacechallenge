"""Explicit map-first diagnostics. No synthetic observations or universal risk score."""
import numpy as np

PRIMARY = [
 {'id':'T2M','label':'Temperature','subtitle':'Air temperature at 2 m','icon':'thermometer','color':'#a84638','code':'T2M'},
 {'id':'VPD_kpa','label':'Air drying','subtitle':'Vapor-pressure deficit','icon':'wind','color':'#b77932','code':'VPD · kPa'},
 {'id':'P_minus_E','label':'Water balance','subtitle':'Rainfall minus evaporation','icon':'droplets','color':'#307d86','code':'P − E'},
 {'id':'PRECTOTCORR_m2','label':'Rainfall · model','subtitle':'MERRA-2 precipitation','icon':'cloud-rain','color':'#477b9a','code':'PRECTOTCORR'},
 {'id':'PRECIP_gpm','label':'Rainfall · satellite','subtitle':'GPM / IMERG · from 2001','icon':'satellite','color':'#6d6aab','code':'PRECIP GPM'},
 {'id':'SWGDN','label':'Solar energy','subtitle':'Downward surface shortwave','icon':'sun','color':'#ab7d24','code':'SOLAR'},
 {'id':'AOD_total','label':'Clarity clue','subtitle':'Aerosol optical depth · lower = less extinction','icon':'haze','color':'#6d8878','code':'AOD · CLARITY'},
]

SPECS = [
 dict(id='HEAT_DRYING',title='Heat + dry air',scientificName='Hot / high-VPD monthly co-occurrence',subtitle='When warmth and drying demand coincide',inputs=['T2M','VPD_kpa'],tests=[['T2M','>',.9],['VPD_kpa','>',.9]],color='#aa4b3f',icon='thermometer',question='Are unusually hot months also unusually demanding on atmospheric moisture?',caution='Temperature is an input to VPD. Co-occurrence is not independent causal evidence, measured soil drought, crop damage or a health index.'),
 dict(id='HEAT_RAIN',title='Heat + rainfall shortfall',scientificName='Hot / low-precipitation monthly co-occurrence',subtitle='High temperature meets locally low rainfall',inputs=['T2M','PRECTOTCORR_m2'],tests=[['T2M','>',.9],['PRECTOTCORR_m2','<',.1]],color='#ba7541',icon='sun-dim',question='How often do unusually hot months coincide with relatively low rain?',caution='Uses MERRA-2 rainfall, not GPCP. Relative shortfall is not an absolute drought threshold. This differs from the archived GPCP hot–dry diagnostic.'),
 dict(id='HEAT_DRY_RAIN',title='Heat, dry air + low rain',scientificName='Hot / high-VPD / low-precipitation monthly co-occurrence',subtitle='Three conditions. One transparent count.',inputs=['T2M','VPD_kpa','PRECTOTCORR_m2'],tests=[['T2M','>',.9],['VPD_kpa','>',.9],['PRECTOTCORR_m2','<',.1]],color='#93455e',icon='scan-search',question='Do heat, high drying demand and rainfall shortfall occur in the same month?',caution='An exploratory three-condition screen, not a validated stress, fire, drought or health index. Temperature and VPD are mathematically dependent.'),
 dict(id='RAIN_GAP',title='Two rainfall stories',scientificName='IMERG minus MERRA-2 precipitation-rate difference',subtitle='Compare estimates—not a model with “truth”',inputs=['PRECIP_gpm','PRECTOTCORR_m2'],tests=[],color='#5679a5',icon='git-compare-arrows',question='Where and when do the two precipitation records disagree?',caution='A cross-product difference, not observational bias against a ground-truth reference. Products can differ in resolution, retrievals and sampling. Available only in 2001–2024.'),
 dict(id='CLEAR_SOLAR',title='Bright + low-aerosol months',scientificName='High-solar / low-aerosol monthly co-occurrence',subtitle='Solar energy meets the clarity clue',inputs=['SWGDN','AOD_total'],tests=[['SWGDN','>',.9],['AOD_total','<',.1]],color='#9a812f',icon='sun',question='How often does high surface solar energy coincide with low column aerosol loading?',caution='Aerosol optical depth is not surface visibility. Clouds and other factors also control solar energy. This is not a photovoltaic-yield estimate or causal aerosol attribution.'),
 dict(id='HOT_WATER',title='Heat + water-balance shortfall',scientificName='Hot / low-P−E monthly co-occurrence',subtitle='A separate water-budget line of evidence',inputs=['T2M','P_minus_E'],tests=[['T2M','>',.9],['P_minus_E','<',.1]],color='#367e80',icon='droplets',question='Do unusually warm months coincide with low atmospheric P−E?',caution='P−E is an atmospheric flux proxy, not root-zone wetness, runoff, groundwater or usable water. This cannot replace GWETROOT measurements.'),
]

def extend(variables, recipes, wide):
    thresholds={}
    for spec in SPECS:
        gap=spec['id']=='RAIN_GAP'
        variables.append({'id':spec['id'],'name':spec['scientificName'],'short':spec['title'],'dataset':'Derived · product comparison' if gap else 'Exploratory · fixed monthly thresholds','unit':'mm/day' if gap else '% of months','trendUnit':'mm/day / decade' if gap else 'pp / decade','group':'Combined lenses','decimals':3 if gap else 2,'description':spec['question']+' '+spec['caution'],'start':2001 if gap else 1984,'end':2024,'qa':False,'exploratory':not gap,'compound':True})
        recipe={**spec,'unit':'mm/day' if gap else '% of months','description':spec['question'],'kind':'product_difference' if gap else 'joint_event','exploratory':not gap}
        recipe['formula']='PRECIP_gpm − PRECTOTCORR_m2' if gap else '100 × mean['+' AND '.join(f'{vid} {op} local calendar-month P{round(q*100)}' for vid,op,q in spec['tests'])+']'
        recipe['baseline']='2001–2024 paired coverage; no threshold baseline' if gap else 'Fixed 1991–2020, separately by region and calendar month; strict inequalities'
        recipes.append(recipe)
        if gap:
            wide[spec['id']]=wide.PRECIP_gpm-wide.PRECTOTCORR_m2
            continue
        wide[spec['id']]=0.0
        for (rid,month),group in wide.groupby(['region','month']):
            ref=group[group.year.between(1991,2020)]
            event=np.ones(len(group),dtype=bool)
            values=[]
            for vid,op,q in spec['tests']:
                cut=float(ref[vid].quantile(q))
                event &= (group[vid].to_numpy()>cut) if op=='>' else (group[vid].to_numpy()<cut)
                values.append({'variable':vid,'operator':op,'quantile':q,'threshold':cut,'n':len(ref)})
            thresholds[f'{rid}|{spec["id"]}|{month}']=values
            wide.loc[group.index,spec['id']]=100*event.astype(float)
    return {'primaryVariables':PRIMARY,'caseIds':[s['id'] for s in SPECS], 'variableDecisions':{'GWETROOT':'Not supplied. Replaced with P−E after user authorized a substitute; not a soil-wetness estimate.','PRECTROOT':'User confirmed PRECTOTCORR_m2, the supplied MERRA-2 rainfall record.','SOLAR':'SWGDN, kept separate from Clarity.','CLARITY':'AOD_total used as an explicitly labelled aerosol-extinction clue, not a validated clarity or visibility index.'}},thresholds

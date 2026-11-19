#!/bin/bash
A=/mnt/user-data/attachments/cb1caadd-3e86-5118-8d81-c9eb497e3727
cd /home/claude/bp-master/engine && python3 -I build_report.py --year 2026 --week 46 --as-of 2026-11-18 \
 --workstation $A/02bc8d19-VF_Incubation_Workstation_Compliance_Audit_File.xlsx \
 --bottom-rope $A/2c055618-VF_Hapa_Bottom_Rope_Checks_5.xlsx --day3 $A/9fa0967c-VF_3-Day_pond_Survival_2.xlsx \
 --biosecurity $A/f44a7d4f-VF_Biosecurity_and_Hygiene_Updated.xlsx --parasitology $A/316d402b-VF_Incubation_Parasitology_Data_File.xlsx \
 --ras-water $A/d08ab077-RAS_Water_vs_Parasite_Prevalence_9-14Nov_3.xlsx \
 --stocking $A/373971a3-Vf_Fry_To_Pond_Stocking_Numbers_Audit_File.xlsx --fry-transfers $A/b3a849e6-Fish_Transfers.xlsx \
 --egg-collection $A/65025416-VF_Egg_Collection_Monitoring_Data.xlsx --pond-flipping $A/3a70d6bb-VF_Pond_Flipping_Compliance_Audit_File.xlsx \
 --hapa-exchange $A/30fc8306-VF_Hapa_Exchange_Compliance_Data_File.xlsx \
 --out ../out/VF_BP_Week_46_v3.pptx

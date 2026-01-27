#!/bin/bash

# Re-ingest all 37 regulations to add recitals
# Run this script from the project root

echo "Re-ingesting all EU regulations with recitals..."
echo "This will take 5-10 minutes..."
echo ""

REGULATIONS=(
  "32016R0679:gdpr"
  "32022L2555:nis2"
  "32022R2554:dora"
  "32024R1689:ai-act"
  "32024R2847:cra"
  "32019R0881:cybersecurity-act"
  "32025R0038:cyber_solidarity"
  "02002L0058-20091219:eprivacy"
  "32016L0680:led"
  "32024R0482:eucc"
  "02014R0910-20241018:eidas2"
  "32023R2854:data-act"
  "32022R2065:dsa"
  "32022R1925:dma"
  "32022R0868:dga"
  "32018L1972:eecc"
  "32025R0327:ehds"
  "32017R0745:mdr"
  "32017R0746:ivdr"
  "32023R1114:mica"
  "32015L2366:psd2"
  "32014L0065:mifid2"
  "32014R0600:mifir"
  "32011L0061:aifmd"
  "32019R2088:sfdr"
  "32020R0852:eu_taxonomy"
  "32023R0988:gpsr"
  "32023R1230:machinery"
  "32024L2853:pld"
  "32014L0053:red"
  "32022L2464:csrd"
  "32024L1760:csddd"
  "32023R0956:cbam"
  "32023R1115:eudr"
  "32022L2557:cer"
  "42021X0387:un-r155"
  "42021X0388:un-r156"
)

TOTAL=${#REGULATIONS[@]}
CURRENT=0

for reg in "${REGULATIONS[@]}"; do
  CURRENT=$((CURRENT + 1))
  IFS=':' read -r celex filename <<< "$reg"

  echo "[$CURRENT/$TOTAL] Re-ingesting $filename (CELEX: $celex)"

  if [[ "$celex" == 42021X* ]]; then
    # UN/ECE regulations use different ingestion script
    npx tsx scripts/ingest-unece.ts "$celex" "data/seed/${filename}.json"
  else
    # EU regulations use EUR-Lex ingestion
    npx tsx scripts/ingest-eurlex.ts "$celex" "data/seed/${filename}.json"
  fi

  if [ $? -ne 0 ]; then
    echo "  ⚠️  Warning: Failed to ingest $filename"
  fi
  echo ""
done

echo "Re-building database..."
npm run build:db

echo ""
echo "✅ Done! Checking recital counts..."
sqlite3 data/regulations.db "SELECT regulation, COUNT(*) as recital_count FROM recitals GROUP BY regulation ORDER BY recital_count DESC LIMIT 10;"

echo ""
echo "Run 'npm test' to verify everything works."

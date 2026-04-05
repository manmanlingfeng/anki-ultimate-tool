#!/bin/bash
# Batch generate and apply examples for cards without examples in a specific deck

DECK="Chinese::Chinese Phrase::Chinese Phrase - Simplified::Chinese Phrase - Simplified - I::Part 0"
API_URL="http://localhost:3002"

echo "Finding cards without examples in deck: $DECK"

# Get note IDs of cards without examples
note_ids=$(curl -s localhost:8765 -X POST -d "{\"action\": \"findNotes\", \"version\": 6, \"params\": {\"query\": \"deck:\\\"$DECK\\\" -Example:_*\"}}" | jq -r '.result[]')

count=$(echo "$note_ids" | wc -l | tr -d ' ')
echo "Found $count cards without examples"

if [ "$count" -eq 0 ]; then
  echo "All cards already have examples!"
  exit 0
fi

# Process each card
current=0
success=0
failed=0

for note_id in $note_ids; do
  current=$((current + 1))

  # Get card info
  card_info=$(curl -s localhost:8765 -X POST -d "{\"action\": \"notesInfo\", \"version\": 6, \"params\": {\"notes\": [$note_id]}}" | jq '.result[0]')
  word=$(echo "$card_info" | jq -r '.fields.Word.value')
  pinyin=$(echo "$card_info" | jq -r '.fields.Pinyin.value')
  definition=$(echo "$card_info" | jq -r '.fields.Definition.value')

  echo "[$current/$count] Processing: $word"

  # Generate example
  gen_result=$(curl -s -X POST "$API_URL/api/ai/generate-examples" \
    -H 'Content-Type: application/json' \
    -d "{\"note_id\": $note_id, \"word\": \"$word\", \"pinyin\": \"$pinyin\", \"definition\": \"$definition\"}" 2>/dev/null)

  # Extract HTML (with proper JSON escaping)
  echo "$gen_result" > /tmp/gen_result_$note_id.json
  html=$(cat /tmp/gen_result_$note_id.json | jq '.html')

  if [ "$html" == "null" ] || [ -z "$html" ]; then
    echo "  ERROR: Failed to generate example"
    failed=$((failed + 1))
    continue
  fi

  # Apply example
  apply_result=$(curl -s -X POST "$API_URL/api/ai/apply-suggestion" \
    -H 'Content-Type: application/json' \
    -d "{\"note_id\": $note_id, \"field_name\": \"Example\", \"value\": $html}")

  apply_success=$(echo "$apply_result" | jq -r '.success')

  if [ "$apply_success" == "true" ]; then
    echo "  SUCCESS: Example applied"
    success=$((success + 1))
  else
    echo "  ERROR: Failed to apply example"
    failed=$((failed + 1))
  fi

  # Clean up
  rm -f /tmp/gen_result_$note_id.json

  # Small delay to prevent API rate limiting
  sleep 0.3
done

echo ""
echo "=========================================="
echo "Completed!"
echo "Success: $success"
echo "Failed: $failed"
echo "=========================================="

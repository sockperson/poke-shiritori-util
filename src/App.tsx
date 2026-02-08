import { useMemo, useState } from 'react'
import { Box, Stack, TextField, Avatar, Autocomplete, FormControlLabel, Checkbox } from '@mui/material'
import pokemon from '../resource/data.json'
import './App.css'

import HelpOutlineIcon from '@mui/icons-material/HelpOutline'

// Monolith app

type Pokemon = { 
  id: number; 
  name: string; 
  jpName: string;
  isFinalEvolution: boolean;
  isRestricted: boolean;
}

//////////////////////////////////////
// Helpers to compare Japanese strings
//////////////////////////////////////

// removes dakuten/handakuten and converts to katakana for matching purposes
function normalize(input: string): string {
  if (!input) return ''
  const special = normalizeSpecialCases(input)
  const ending = normalizeEnding(special)
  const kana = normalizeKana(ending)
  const daku = normalizeDakuten(kana)
  const small = normalizeSmallKana(daku)
  return small;
}

// edge cases...
// "ポリゴン2" --> "ポリゴンツー"
// "ポリゴンZ" --> "ポリゴンゼット"
function normalizeSpecialCases(input: string): string {
  const specialCases: Record<string, string> = {
    '２': 'ツー',
    'Ｚ': 'ゼット',
  }
  if (!input) return ''
  let out = input
  for (const [from, to] of Object.entries(specialCases)) {
    // Replace all occurrences of the key substring
    out = out.split(from).join(to)
  }
  return out
}

// ignore the long vowel mark 'ー' if it's at the end
function normalizeEnding(input: string): string {
  if (!input) return ''
  const nk = input.normalize('NFKC')
  let end = nk.length - 1
  while (end >= 0) {
    const ch = nk[end]
    if (ch === 'ー') {
      end--
      continue
    }
    break
  }
  return nk.slice(0, end + 1)
}

// Normalize input for script-insensitive matching:
// - Convert half-width to full-width (NFKC)
// - Convert Hiragana to Katakana (consistent script)
// - Lowercase ASCII
function normalizeKana(input: string): string {
  if (!input) return ''
  const nk = input.normalize('NFKC')
  let out = ''
  for (const ch of nk) {
    const code = ch.charCodeAt(0)
    // Hiragana small/regular (U+3041..U+3096) → Katakana (code + 0x60)
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCharCode(code + 0x60)
    } else {
      out += ch
    }
  }
  out = out.toLowerCase();
  return out;
}

function normalizeDakuten(input: string): string {
  // Normalize dakuten/handakuten to their base characters for matching
  const map: Record<string, string> = {
    'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ',
    'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ',
    'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト',
    'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ',
    // Handakuten
    'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ',
  }
  let out = ''
  // only convert characters at the start or end
  for (let index = 0; index < input.length; index++) {
    const ch = input[index];
    if (index === 0 || index === input.length - 1) {
      out += map[ch] || ch
    } else {
      out += ch
    }
  }
  return out;
}

function isSmallKana(ch: string): boolean {
  // Hiragana small: ぁぃぅぇぉっゃゅょゎ
  // Katakana small: ァィゥェォッャュョヮ and small ka/ke: ヵヶ
  const smallHira = 'ぁぃぅぇぉっゃゅょゎ'
  const smallKata = 'ァィゥェォッャュョヮヵヶ'
  return smallHira.includes(ch) || smallKata.includes(ch)
}

// Convert any small kana in the string to their large counterparts
// Examples:
// - "カイリュー" -> "カイリユー"
// - "にゃん" -> "にやん"
export function normalizeSmallKana(input: string): string {
  if (!input) return ''
  const nk = input.normalize('NFKC')
  const map: Record<string, string> = {
    // Hiragana small → large
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
    'っ': 'つ',
    // Rare small hira ka/ke
    'ゕ': 'か', 'ゖ': 'け',
    // Katakana small → large
    'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
    'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ',
    'ッ': 'ツ',
    // Small katakana ka/ke
    'ヵ': 'カ', 'ヶ': 'ケ',
  }
  let out = ''
  for (const ch of nk) {
    out += (isSmallKana(ch) && map[ch]) ? map[ch] : ch
  }
  return out
}

function getThumbnail(id: number): string {
  // pad to 4 digits
  let s = id.toString();
  while (s.length < 4) s = '0' + s
  return `https://s3-ap-northeast-1.amazonaws.com/pokedb.tokyo/sv/assets/pokemon/thumbs/pokemon-${s}-00.png`
}

// returns validity of shiritori given the previous, next, and current Pokemon names
// returns "VALID": if valid
// returns "INVALID": if invalid
// returns "NA" if curr is empty
function getShiritoriValidity(
  prev: Pokemon | null, 
  next: Pokemon | null, 
  curr: string
): boolean {
  if (curr.trim() === '') return true;
  const normalizedCurr = normalize(curr);

  const prevName = prev?.jpName ?? '';
  const nextName = next?.jpName ?? '';

  let prevMatch = true;
  let nextMatch = true;

  if (prevName !== '') {
    const lastChar = normalize(prevName).slice(-1);
    prevMatch = normalizedCurr.startsWith(lastChar);
  }
  
  if (nextName !== '') {
    const firstChar = normalize(nextName)[0];
    nextMatch = normalizedCurr.endsWith(firstChar);
  }

  return prevMatch && nextMatch;
}

function App() {
  console.log(normalize("ポリゴンＺ"));
  const data = useMemo(() => pokemon as Array<Pokemon>, [])

  const [inputValues, setInputValues] = useState<string[]>(Array(6).fill(''))
  const [selectedPokemon, setSelectedPokemon] = useState<(Pokemon | null)[]>(Array(6).fill(null))

  const [useOnlyFinalEvolutions, setUseOnlyFinalEvolutions] = useState(false);

  // render a Pokemon's icon if one is selected.
  // otherwise, render an empty icon
  const pokemonIcon = (p: Pokemon | null) => {
    if (p) {
      return <Avatar
        src={getThumbnail(p.id)}
        alt={p.jpName}
        variant="square"
        sx={{ width: 50, height: 50 }}
      />
    } else {
      return <Avatar variant="square" sx={{ width: 40, height: 40, bgcolor: 'action.selected' }}>
        <HelpOutlineIcon fontSize="small" />
      </Avatar>
    }
  }

  const picker = (index: number) => {
    const rawInput = (inputValues[index] || '').trim()
    const currentInput = normalizeKana(rawInput);
    const prevPokemon = selectedPokemon[index - 1];
    const nextPokemon = selectedPokemon[index + 1];

    // given the available Pokemon list filter possible options based on:
    // characters inputted into the picker,
    // the previous Pokemon's ending character, and
    // the next Pokemon's starting character
    const filtered = data.filter((p) => {
      if (p.isRestricted) {
        return false;
      }
      if (useOnlyFinalEvolutions && !p.isFinalEvolution) {
        return false;
      }
      const label = p.jpName;

      // check if shiritori is valid
      const shiritoriValidity = getShiritoriValidity(prevPokemon, nextPokemon, label)
      if (!shiritoriValidity) {
        return false;
      } 
      // finally check if it matches the current input
      return currentInput ? normalizeKana(label).startsWith(currentInput) : true
    })

    return (
      <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', maxWidth: 800, justifyContent: 'center' }}>
      <Box sx={{ width: 50, display: 'flex', justifyContent: 'center' }}>
        {pokemonIcon(selectedPokemon[index])}
      </Box>
      <Autocomplete
        sx={{
          flexGrow: 1,
          minWidth: 0,
          maxWidth: 550
        }}
        fullWidth
        options={filtered.slice().sort((a, b) => { // sort by dex ID
          return a.id - b.id;
        })}
        filterOptions={(_options, _state) => {
          const shouldGate = !rawInput && !prevPokemon && !nextPokemon
          if (shouldGate) return [] // show nothing if no input AND no prev/next pokemon, to avoid excess options
          return filtered;
        }}
        openOnFocus={false}
        clearOnBlur={false}
        noOptionsText={!rawInput && !prevPokemon && !nextPokemon
          ? 'ポケモン名を入力してください'
          : '該当するポケモンが見つかりません'}
        getOptionLabel={(o) => o.jpName ?? o.name}
        isOptionEqualToValue={(o, v) => !!v && o.id === v.id}
        inputValue={inputValues[index]}
        onInputChange={(_, v) =>
          setInputValues(prev => {
            const next = [...prev]
            next[index] = v
            return next
          })
        }
        value={selectedPokemon[index] ?? null}
        onChange={(_, v) =>
          setSelectedPokemon(prev => {
            const next = [...prev]
            next[index] = v
            return next
          })
        }
        renderOption={(props, option) => {
          const { key, ...liProps } = props
          return (
            <li key={key} {...liProps}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar
                  src={getThumbnail(option.id)}
                  alt={option.jpName}
                  variant="square"
                  sx={{ width: 32, height: 32 }}
                />
                <span>{option.jpName}</span>
              </Stack>
            </li>
          )
        }}
        renderInput={(params) => <TextField {...params} label={`ポケモン ${index + 1}`} placeholder="例: ニンフィア" />}
      />
      </Stack>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={2} alignItems="stretch" sx={{ width: '100%' }}>
        <Box sx={{ textAlign: 'center' }}>
          <h3>ポケモンしりとりutil</h3>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={useOnlyFinalEvolutions}
                onChange={(e) => setUseOnlyFinalEvolutions(e.target.checked)}
              />
            }
            label="最終進化形のみを使用する"
          />
        </Box>
          {
            Array.from({ length: 6 }).map((_, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'center' }}>
                {picker(i)}
              </Box>
            ))
          }
      </Stack>
    </Box>
  )
}

export default App

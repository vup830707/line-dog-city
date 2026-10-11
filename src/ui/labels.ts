import type { DecorType, Job, Phase, StallType, Weather } from '../rules/types'

export const WEATHER_LABEL: Record<Weather, string> = { sunny: '晴', hot: '熱', cold: '冷', rain: '雨' }
export const PHASE_LABEL: Record<Phase, string> = { dusk: '入夜', mid: '中夜', late: '深夜' }
export const JOB_LABEL: Record<Job, string> = { restock: '補貨', clean: '掃地', greet: '招呼', rest: '休息' }

export const STALL_ORDER: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish', 'skewer']
export const DECOR_ORDER: DecorType[] = ['lantern', 'seat', 'sign', 'flower', 'star', 'string']

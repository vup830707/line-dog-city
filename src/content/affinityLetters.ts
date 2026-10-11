import type { Species } from '../rules/types'

/** Second and third letters. The first letter still lives in `LETTERS`. */
export const AFFINITY_LETTERS: Record<Species, { second: string; third: string }> = {
  cat: {
    second: '三花貓又坐到燈籠底下，說這條街的光它記住了。',
    third: '三花貓把籤折成小心，說還會再來算一次。',
  },
  rabbit: {
    second: '月兔留下第二張糖紙，草莓的味道還在。',
    third: '月兔說花車旁邊的位子，它想一直坐下去。',
  },
  hamster: {
    second: '倉鼠在招牌下把晴天罐轉了一圈，又寫了謝謝。',
    third: '倉鼠說罐頭排好的樣子，像一條小小的街。',
  },
  sparrow: {
    second: '夜鴨子又繞着燈籠飛了一圈，把今晚的風寫下來。',
    third: '夜鴨子說香草的味道，是它認得回家的路。',
  },
  otter: {
    second: '水獺在長椅上把尾巴甩乾，留了第二張濕紙條。',
    third: '水獺說充完電的位子，它想分給朋友。',
  },
  hedgehog: {
    second: '刺蝟在深夜又來了，說長椅的安靜剛剛好。',
    third: '刺蝟把一顆小果子留在算命攤旁邊。',
  },
  fox: {
    second: '小貓熊數完招牌上的燈，說還想再抽一次。',
    third: '小貓熊把喜歡的賞抱緊，說明天也會來。',
  },
  bear: {
    second: '浣熊在許願池邊坐下，說星星今晚特別甜。',
    third: '浣熊留下一顆小石頭，說是池邊撿的幸運。',
  },
}

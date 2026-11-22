

















































import { $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";






export const errorCombineTable: Readonly<Record<string, string>> = {

  teh: "the",
  adn: "and",
  taht: "that",
  thier: "their",
  wich: "which",
  freind: "friend",
  freinds: "friends",
  gaurd: "guard",
  writting: "writing",
  rythm: "rhythm",


  recieve: "receive",
  recieved: "received",
  beleive: "believe",
  belive: "believe",
  acheive: "achieve",
  foriegn: "foreign",
  freindly: "friendly",


  occured: "occurred",
  occuring: "occurring",
  occassion: "occasion",
  posession: "possession",
  untill: "until",
  immediatly: "immediately",
  refered: "referred",


  seperate: "separate",
  seperated: "separated",
  definately: "definitely",
  enviroment: "environment",
  goverment: "government",
  knowlege: "knowledge",
  langauge: "language",
  happend: "happened",
  experiance: "experience",
  diffrent: "different",
  calender: "calendar",
  truely: "truly",
  usefull: "useful",


  accomodate: "accommodate",
  neccessary: "necessary",
  necesary: "necessary",
  succesful: "successful",
  sucessful: "successful",
  tommorow: "tomorrow",
  tommorrow: "tomorrow",
  whereever: "wherever",
  publically: "publicly",
  maintainance: "maintenance",
  persistant: "persistent",
  priviledge: "privilege",
  recommand: "recommend",
  relevent: "relevant",
  strenght: "strength",
  threshhold: "threshold",


  becuase: "because",
  becasue: "because",
  realy: "really",



  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  werent: "weren't",
  arent: "aren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  youre: "you're",
  theyre: "they're",
  weve: "we've",
  thats: "that's",
  whats: "what's",
  theres: "there's",
  heres: "here's",
  wheres: "where's",
};


















export function replaceWord(word: string): string | null {
  const correct2 = errorCombineTable[word.toLowerCase()];
  if (!correct2) return null;
  if (word === word.toLowerCase()) return correct2;
  if (word === word.toUpperCase()) return correct2.toUpperCase();
  const first = word[0]!;
  const tail = word.slice(1);
  if (first === first.toUpperCase() && tail === tail.toLowerCase()) return first + correct2.slice(1);
  return null;
}






const ruleRuleOption = { inCodeMark: false } as const;















export const wordTailCorrectRule = /([A-Za-z][A-Za-z']*)([ \t\u00a0])$/;











export function selfActionMoreCorrectInput(open2: boolean) {
  if (!open2) return [];
  return [
    $inputRule(() =>
      new InputRule(wordTailCorrectRule, (state, match2, start6, end3) => {
        const replace = replaceWord(match2[1]!);
        if (!replace) return null;



        return state.tr.insertText(replace + match2[2]!, start6, end3);
      }, ruleRuleOption),
    ),
  ];
}

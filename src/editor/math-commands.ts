






























































import { PHYSICS_MACROS, PHYSICS_SAMPLES } from "./math-macros";







export type candidate = {
  command: string;

  description: string;

  insert: string;

  sample: string;

  normalUse: boolean;

  family: "command" | "physics";
};








type HandWriteItem = readonly [name3: string, insert: string, sample: string, description: string];


const normalUseName = new Set([
  "frac",
  "sqrt",
  "sum",
  "int",
  "lim",
  "alpha",
  "theta",
  "left",
  "right",
  "text",
]);





const handWriteTable: readonly HandWriteItem[] = [

  ["frac", "\\frac{}{}", "\\frac{a}{b}", "fraction"],
  ["dfrac", "\\dfrac{}{}", "\\dfrac{a}{b}", "display fraction"],
  ["sqrt", "\\sqrt{}", "\\sqrt{x}", "square root"],
  ["sum", "\\sum_{}^{}", "\\sum_{i=1}^{n} a_i", "summation"],
  ["prod", "\\prod_{}^{}", "\\prod_{i=1}^{n} a_i", "product"],
  ["int", "\\int_{}^{}", "\\int_{a}^{b} f(x)\\,dx", "definite integral"],
  ["iint", "\\iint_{}^{}", "\\iint_{D} f\\,dA", "double integral"],
  ["oint", "\\oint", "\\oint_C f\\,dz", "contour integral"],
  ["lim", "\\lim_{}", "\\lim_{x \\to 0} \\frac{\\sin x}{x}", "limit"],
  ["binom", "\\binom{}{}", "\\binom{n}{k}", "binomial coefficient"],
  ["begin", "\\begin{}", "\\begin{matrix} a & b \\\\ c & d \\end{matrix}", "environment (matrix / cases / aligned...)"],
  ["left", "\\left(\\right)", "\\left( \\frac{a}{b} \\right)", "automatic parentheses"],





  ["right", "", "\\left. x \\right)", "closing automatic parenthesis"],
  ["text", "\\text{}", "\\text{where } x > 0", "text inside a formula"],
  ["operatorname", "\\operatorname{}", "\\operatorname{tr} A", "upright custom operator"],
  ["boldsymbol", "\\boldsymbol{}", "\\boldsymbol{\\theta}", "bold"],
  ["mathrm", "\\mathrm{}", "\\mathrm{d}", "upright"],



  ["alpha", "", "", "Greek letter α"],
  ["beta", "", "", "Greek letter β"],
  ["gamma", "", "", "Greek letter γ"],
  ["delta", "", "", "Greek letter δ"],
  ["epsilon", "", "", "Greek letter ϵ"],
  ["varepsilon", "", "", "Greek letter ε"],
  ["zeta", "", "", "Greek letter ζ"],
  ["eta", "", "", "Greek letter η"],
  ["theta", "", "", "Greek letter θ"],
  ["vartheta", "", "", "Greek letter ϑ"],
  ["iota", "", "", "Greek letter ι"],
  ["kappa", "", "", "Greek letter κ"],
  ["lambda", "", "", "Greek letter λ"],
  ["mu", "", "", "Greek letter μ"],
  ["nu", "", "", "Greek letter ν"],
  ["xi", "", "", "Greek letter ξ"],
  ["pi", "", "", "Greek letter π"],
  ["rho", "", "", "Greek letter ρ"],
  ["sigma", "", "", "Greek letter σ"],
  ["tau", "", "", "Greek letter τ"],
  ["phi", "", "", "Greek letter ϕ"],
  ["varphi", "", "", "Greek letter φ"],
  ["chi", "", "", "Greek letter χ"],
  ["psi", "", "", "Greek letter ψ"],
  ["omega", "", "", "Greek letter ω"],
  ["Gamma", "", "", "Greek capital Γ"],
  ["Delta", "", "", "Greek capital Δ"],
  ["Theta", "", "", "Greek capital Θ"],
  ["Lambda", "", "", "Greek capital Λ"],
  ["Pi", "", "", "Greek capital Π"],
  ["Sigma", "", "", "Greek capital Σ"],
  ["Phi", "", "", "Greek capital Φ"],
  ["Psi", "", "", "Greek capital Ψ"],
  ["Omega", "", "", "Greek capital Ω"],


  ["times", "", "", "multiplication ×"],
  ["div", "", "", "division ÷"],
  ["pm", "", "", "plus-minus ±"],
  ["mp", "", "", "minus-plus ∓"],
  ["cdot", "", "", "dot product ·"],
  ["ast", "", "", "asterisk ∗"],
  ["circ", "", "", "composition ∘"],
  ["oplus", "", "", "direct sum ⊕"],
  ["otimes", "", "", "tensor product ⊗"],
  ["partial", "", "", "partial derivative ∂"],
  ["nabla", "", "", "gradient ∇"],
  ["infty", "", "", "infinity ∞"],


  ["le", "", "", "less than or equal ≤"],
  ["ge", "", "", "greater than or equal ≥"],
  ["ne", "", "", "not equal ≠"],
  ["approx", "", "", "approximately equal ≈"],
  ["equiv", "", "", "identical ≡"],
  ["sim", "", "", "similar ∼"],
  ["propto", "", "", "proportional to ∝"],
  ["in", "", "", "element of ∈"],
  ["notin", "", "", "not element of ∉"],
  ["subset", "", "", "proper subset ⊂"],
  ["subseteq", "", "", "subset or equal ⊆"],
  ["cup", "", "", "union ∪"],
  ["cap", "", "", "intersection ∩"],
  ["forall", "", "", "for all ∀"],
  ["exists", "", "", "exists ∃"],


  ["to", "", "", "right arrow →"],
  ["rightarrow", "", "", "right arrow →"],
  ["leftarrow", "", "", "left arrow ←"],
  ["leftrightarrow", "", "", "bidirectional arrow ↔"],
  ["Rightarrow", "", "", "implies ⇒"],
  ["Leftarrow", "", "", "implied by ⇐"],
  ["Leftrightarrow", "", "", "equivalent ⇔"],
  ["mapsto", "", "", "maps to ↦"],


  ["cdots", "", "", "centered ellipsis ⋯"],
  ["ldots", "", "", "baseline ellipsis …"],
  ["vdots", "", "", "vertical ellipsis ⋮"],
  ["ddots", "", "", "diagonal ellipsis ⋱"],
  ["hat", "\\hat{}", "\\hat{x}", "one-character hat"],
  ["bar", "\\bar{}", "\\bar{x}", "one-character overline"],
  ["vec", "\\vec{}", "\\vec{a}", "vector arrow"],
  ["dot", "\\dot{}", "\\dot{x}", "first derivative dot"],
  ["ddot", "\\ddot{}", "\\ddot{x}", "second derivative dot"],
  ["tilde", "\\tilde{}", "\\tilde{x}", "tilde"],
  ["overline", "\\overline{}", "\\overline{AB}", "overline"],
  ["underline", "\\underline{}", "\\underline{AB}", "underline"],
  ["widehat", "\\widehat{}", "\\widehat{ABC}", "hat accent"],
  ["overrightarrow", "\\overrightarrow{}", "\\overrightarrow{AB}", "long arrow"],


  ["displaystyle", "", "", "use display formula sizing"],
  ["textstyle", "", "", "use inline formula sizing"],
  ["quad", "", "", "single wide space"],
  ["qquad", "", "", "double wide space"],
  ["limits", "", "", "move limits above and below the operator"],
  ["nolimits", "", "", "move limits beside the operator"],
];











export const candidateLimit = 10;









function handWriteCandidate(item4: HandWriteItem): candidate {
  const [name3, insert, sample, description] = item4;
  const command = `\\${name3}`;
  const assertValueInsert = insert === "" ? command : insert;
  return {
    command,
    description,
    insert: assertValueInsert,
    sample: sample === "" ? assertValueInsert : sample,
    normalUse: normalUseName.has(name3),
    family: "command",
  };
}







function numberParameter(expand2: string): number {
  let large = 0;
  for (const match2 of expand2.matchAll(/#(\d)/g)) {
    const ordinal = Number(match2[1]);
    if (ordinal > large) large = ordinal;
  }
  return large;
}








function physicsCandidatePlural(): candidate[] {
  const output2: candidate[] = [];
  for (const [command, expand2] of Object.entries(PHYSICS_MACROS)) {
    const parameterMeasure = numberParameter(expand2);
    output2.push({
      command,
      description: parameterMeasure
        ? `physics macro with ${parameterMeasure} argument(s)`
        : "physics macro without arguments",
      insert: command + "{}".repeat(parameterMeasure),
      sample: PHYSICS_SAMPLES[command as keyof typeof PHYSICS_SAMPLES] ?? command,
      normalUse: false,
      family: "physics",
    });
  }
  return output2;
}







const physicsName = new Set(Object.keys(PHYSICS_MACROS));


















export function createCommandTable(hasphysics: boolean): candidate[] {
  const handWrite = handWriteTable.map(handWriteCandidate);
  const output2 = hasphysics ? handWrite.filter((item4) => !physicsName.has(item4.command)) : handWrite;
  if (hasphysics) output2.push(...physicsCandidatePlural());
  return output2;
}


export type WhenScene = {

  start5: number;

  word: string;
};


const isCharacterMother = (character2: string): boolean => /^[A-Za-z]$/.test(character2);












export function findCurrent(source3: string, cursor: number): WhenScene | null {
  if (cursor <= 0 || cursor > source3.length) return null;

  let i = cursor;



  while (i > 0 && isCharacterMother(source3.charAt(i - 1))) i--;
  if (i === 0) return null;
  if (source3[i - 1] !== "\\") return null;


  let connectActiveOf = 0;
  while (i - 2 - connectActiveOf >= 0 && source3[i - 2 - connectActiveOf] === "\\") connectActiveOf++;
  if (connectActiveOf % 2 === 1) return null;

  return { start5: i - 1, word: source3.slice(i, cursor) };
}
















export function pickCandidate(table2: readonly candidate[], word: string, limit = candidateLimit): candidate[] {
  if (word === "") return table2.filter((item4) => item4.normalUse).slice(0, limit);

  const smallWord = word.toLowerCase();
  const middle = table2.filter((item4) => item4.command.slice(1).toLowerCase().startsWith(smallWord));
  return [...middle]
    .sort((alpha, beta) => alpha.command.length - beta.command.length || alpha.command.localeCompare(beta.command))
    .slice(0, limit);
}


export type ReceiveBelow = {
  source3: string;

  cursor: number;
};











export function setUse(source3: string, cursor: number, WhenScene: WhenScene, item4: candidate): ReceiveBelow {
  const newValueSource2 = source3.slice(0, WhenScene.start5) + item4.insert + source3.slice(cursor);
  const hole = item4.insert.indexOf("{}");
  return {
    source3: newValueSource2,
    cursor: WhenScene.start5 + (hole >= 0 ? hole + 1 : item4.insert.length),
  };
}

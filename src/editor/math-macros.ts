
















































import type { KatexOptions } from "katex";









export const PHYSICS_MACROS = {


  "\\qty": "\\left(#1\\right)",
  "\\pqty": "\\left(#1\\right)",
  "\\bqty": "\\left[#1\\right]",
  "\\vqty": "\\left|#1\\right|",
  "\\Bqty": "\\left\\{#1\\right\\}",
  "\\absolutevalue": "\\left|#1\\right|",
  "\\abs": "\\left|#1\\right|",
  "\\norm": "\\left\\|#1\\right\\|",


  "\\evaluated": "\\left.#1\\right|",
  "\\eval": "\\left.#1\\right|",
  "\\order": "O\\left(#1\\right)",
  "\\commutator": "\\left[#1,#2\\right]",
  "\\comm": "\\left[#1,#2\\right]",
  "\\anticommutator": "\\left\\{#1,#2\\right\\}",
  "\\acomm": "\\left\\{#1,#2\\right\\}",

  "\\poissonbracket": "\\left\\{#1,#2\\right\\}",
  "\\pb": "\\left\\{#1,#2\\right\\}",




  //






  //





  "\\differential": "\\mathrm{d}",
  "\\dd": "\\mathrm{d}",
  "\\derivative": "\\frac{d#1}{d#2}",
  "\\dv": "\\frac{d#1}{d#2}",
  "\\partialderivative": "\\frac{\\partial #1}{\\partial #2}",
  "\\pderivative": "\\frac{\\partial #1}{\\partial #2}",
  "\\pdv": "\\frac{\\partial #1}{\\partial #2}",
  "\\functionalderivative": "\\frac{\\delta #1}{\\delta #2}",
  "\\fdv": "\\frac{\\delta #1}{\\delta #2}",


  "\\variation": "\\delta",
  "\\var": "\\delta",

  "\\flatfrac": "#1/#2",




  "\\vectorbold": "\\mathbf{#1}",
  "\\vb": "\\mathbf{#1}",
  "\\vectorarrow": "\\vec{#1}",
  "\\va": "\\vec{#1}",
  "\\vectorunit": "\\hat{#1}",
  "\\vu": "\\hat{#1}",

  "\\dotproduct": "\\boldsymbol{\\cdot}",
  "\\vdot": "\\boldsymbol{\\cdot}",
  "\\crossproduct": "\\boldsymbol{\\times}",
  "\\cross": "\\boldsymbol{\\times}",
  "\\cp": "\\boldsymbol{\\times}",


  "\\gradient": "\\boldsymbol{\\nabla}",
  "\\grad": "\\boldsymbol{\\nabla}",

  "\\divergence": "\\boldsymbol{\\nabla}\\cdot",
  "\\div": "\\boldsymbol{\\nabla}\\cdot",
  "\\curl": "\\boldsymbol{\\nabla}\\times",
  "\\laplacian": "\\nabla^{2}",





  "\\trace": "\\operatorname{tr}",
  "\\tr": "\\operatorname{tr}",
  "\\Trace": "\\operatorname{Tr}",
  "\\Tr": "\\operatorname{Tr}",
  "\\rank": "\\operatorname{rank}",
  "\\erf": "\\operatorname{erf}",
  "\\principalvalue": "\\operatorname{P}",
  "\\pv": "\\operatorname{P}",
  "\\PV": "\\operatorname{P.V.}",


  "\\Re": "\\operatorname{Re}",
  "\\Im": "\\operatorname{Im}",





  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle #1\\right|",







  "\\innerproduct": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\braket": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\ip": "\\left\\langle #1\\middle|#2\\right\\rangle",
  "\\outerproduct": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\dyad": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\ketbra": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",
  "\\op": "\\left|#1\\right\\rangle\\left\\langle #2\\right|",


  "\\expectationvalue": "\\left\\langle #1\\right\\rangle",
  "\\expval": "\\left\\langle #1\\right\\rangle",
  "\\ev": "\\left\\langle #1\\right\\rangle",
  "\\matrixelement": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",
  "\\matrixel": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",
  "\\mel": "\\left\\langle #1\\middle|#2\\middle|#3\\right\\rangle",







  "\\matrixquantity": "\\begin{matrix}#1\\end{matrix}",
  "\\mqty": "\\begin{matrix}#1\\end{matrix}",
  "\\pmqty": "\\left(\\begin{matrix}#1\\end{matrix}\\right)",
  "\\Pmqty": "\\left(\\begin{matrix}#1\\end{matrix}\\right)",
  "\\bmqty": "\\left[\\begin{matrix}#1\\end{matrix}\\right]",
  "\\vmqty": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",
  "\\smallmatrixquantity": "\\begin{smallmatrix}#1\\end{smallmatrix}",
  "\\smqty": "\\begin{smallmatrix}#1\\end{smallmatrix}",
  "\\spmqty": "\\left(\\begin{smallmatrix}#1\\end{smallmatrix}\\right)",
  "\\sbmqty": "\\left[\\begin{smallmatrix}#1\\end{smallmatrix}\\right]",
  "\\matrixdeterminant": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",
  "\\mdet": "\\left|\\begin{matrix}#1\\end{matrix}\\right|",



  "\\qqtext": "\\quad\\text{#1}\\quad",
  "\\qq": "\\quad\\text{#1}\\quad",
  "\\qcomma": ",\\quad",
  "\\qc": ",\\quad",
  "\\qcc": "\\quad\\text{c.c.}\\quad",
  "\\qif": "\\quad\\text{if}\\quad",
  "\\qthen": "\\quad\\text{then}\\quad",
  "\\qelse": "\\quad\\text{else}\\quad",
  "\\qotherwise": "\\quad\\text{otherwise}\\quad",
  "\\qunless": "\\quad\\text{unless}\\quad",
  "\\qgiven": "\\quad\\text{given}\\quad",
  "\\qusing": "\\quad\\text{using}\\quad",
  "\\qassume": "\\quad\\text{assume}\\quad",
  "\\qsince": "\\quad\\text{since}\\quad",
  "\\qlet": "\\quad\\text{let}\\quad",
  "\\qfor": "\\quad\\text{for}\\quad",
  "\\qall": "\\quad\\text{all}\\quad",
  "\\qeven": "\\quad\\text{even}\\quad",
  "\\qodd": "\\quad\\text{odd}\\quad",
  "\\qinteger": "\\quad\\text{integer}\\quad",
  "\\qand": "\\quad\\text{and}\\quad",
  "\\qor": "\\quad\\text{or}\\quad",
  "\\qas": "\\quad\\text{as}\\quad",
  "\\qin": "\\quad\\text{in}\\quad",
} as const satisfies Record<string, string>;









export const PHYSICS_SAMPLES: Record<keyof typeof PHYSICS_MACROS, string> = {
  "\\qty": "\\qty{\\frac{a}{b}}",
  "\\pqty": "\\pqty{a+b}",
  "\\bqty": "\\bqty{a+b}",
  "\\vqty": "\\vqty{a+b}",
  "\\Bqty": "\\Bqty{a+b}",
  "\\absolutevalue": "\\absolutevalue{x}",
  "\\abs": "\\abs{\\frac{a}{b}}",
  "\\norm": "\\norm{\\psi}",
  "\\evaluated": "\\eval{x}_0^\\infty",
  "\\eval": "\\eval{x}_0^\\infty",
  "\\order": "\\order{x^2}",
  "\\commutator": "\\comm{A}{B}",
  "\\comm": "\\comm{A}{B}",
  "\\anticommutator": "\\acomm{A}{B}",
  "\\acomm": "\\acomm{A}{B}",
  "\\poissonbracket": "\\pb{A}{B}",
  "\\pb": "\\pb{A}{B}",
  "\\differential": "\\dd{x}",
  "\\dd": "\\dd{x}",
  "\\derivative": "\\derivative{f}{x}",
  "\\dv": "\\dv{f}{x}",
  "\\partialderivative": "\\partialderivative{f}{x}",
  "\\pderivative": "\\pderivative{f}{x}",
  "\\pdv": "\\pdv{f}{x}",
  "\\functionalderivative": "\\fdv{F}{g}",
  "\\fdv": "\\fdv{F}{g}",
  "\\variation": "\\var{F[g(x)]}",
  "\\var": "\\var{F[g(x)]}",
  "\\flatfrac": "\\flatfrac{a}{b}",
  "\\vectorbold": "\\vb{a}",
  "\\vb": "\\vb{a}",
  "\\vectorarrow": "\\va{a}",
  "\\va": "\\va{a}",
  "\\vectorunit": "\\vu{a}",
  "\\vu": "\\vu{a}",
  "\\dotproduct": "\\vb{a}\\vdot\\vb{b}",
  "\\vdot": "\\vb{a}\\vdot\\vb{b}",
  "\\crossproduct": "\\vb{a}\\cross\\vb{b}",
  "\\cross": "\\vb{a}\\cross\\vb{b}",
  "\\cp": "\\vb{a}\\cp\\vb{b}",
  "\\gradient": "\\grad\\Psi",
  "\\grad": "\\grad\\Psi",
  "\\divergence": "\\div\\vb{a}",
  "\\div": "\\div\\vb{a}",
  "\\curl": "\\curl\\vb{a}",
  "\\laplacian": "\\laplacian\\Psi",
  "\\trace": "\\tr\\rho",
  "\\tr": "\\tr\\rho",
  "\\Trace": "\\Tr\\rho",
  "\\Tr": "\\Tr\\rho",
  "\\rank": "\\rank M",
  "\\erf": "\\erf(x)",
  "\\principalvalue": "\\pv{\\int f(z)\\dd{z}}",
  "\\pv": "\\pv{\\int f(z)\\dd{z}}",
  "\\PV": "\\PV{\\int f(z)\\dd{z}}",
  "\\Re": "\\Re{z}",
  "\\Im": "\\Im{z}",
  "\\ket": "\\ket{\\psi}",
  "\\bra": "\\bra{\\phi}",
  "\\innerproduct": "\\braket{\\phi}{\\psi}",
  "\\braket": "\\braket{\\phi}{\\psi}",
  "\\ip": "\\ip{\\phi}{\\psi}",
  "\\outerproduct": "\\dyad{a}{b}",
  "\\dyad": "\\dyad{a}{b}",
  "\\ketbra": "\\ketbra{a}{b}",
  "\\op": "\\op{a}{b}",
  "\\expectationvalue": "\\expval{A}",
  "\\expval": "\\expval{A}",
  "\\ev": "\\ev{A}",
  "\\matrixelement": "\\mel{n}{A}{m}",
  "\\matrixel": "\\mel{n}{A}{m}",
  "\\mel": "\\mel{n}{A}{m}",
  "\\matrixquantity": "\\mqty{a & b \\\\ c & d}",
  "\\mqty": "\\mqty{a & b \\\\ c & d}",
  "\\pmqty": "\\pmqty{a & b \\\\ c & d}",
  "\\Pmqty": "\\Pmqty{a & b \\\\ c & d}",
  "\\bmqty": "\\bmqty{a & b \\\\ c & d}",
  "\\vmqty": "\\vmqty{a & b \\\\ c & d}",
  "\\smallmatrixquantity": "\\smqty{a & b \\\\ c & d}",
  "\\smqty": "\\smqty{a & b \\\\ c & d}",
  "\\spmqty": "\\spmqty{a & b \\\\ c & d}",
  "\\sbmqty": "\\sbmqty{a & b \\\\ c & d}",
  "\\matrixdeterminant": "\\mdet{a & b \\\\ c & d}",
  "\\mdet": "\\mdet{a & b \\\\ c & d}",
  "\\qqtext": "\\qq{for all}",
  "\\qq": "\\qq{for all}",
  "\\qcomma": "a\\qc b",
  "\\qc": "a\\qc b",
  "\\qcc": "z\\qcc",
  "\\qif": "x\\qif y>0",
  "\\qthen": "\\qthen",
  "\\qelse": "\\qelse",
  "\\qotherwise": "\\qotherwise",
  "\\qunless": "\\qunless",
  "\\qgiven": "\\qgiven",
  "\\qusing": "\\qusing",
  "\\qassume": "\\qassume",
  "\\qsince": "\\qsince",
  "\\qlet": "\\qlet",
  "\\qfor": "\\qfor",
  "\\qall": "\\qall",
  "\\qeven": "\\qeven",
  "\\qodd": "\\qodd",
  "\\qinteger": "\\qinteger",
  "\\qand": "\\qand",
  "\\qor": "\\qor",
  "\\qas": "\\qas",
  "\\qin": "\\qin",
};















export const PHYSICS_EQUIVALENTS: Record<string, string> = {

  "\\dv{f}{x}": "\\frac{df}{dx}",
  "\\derivative{f}{x}": "\\frac{df}{dx}",
  "\\pdv{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\pderivative{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\partialderivative{f}{x}": "\\frac{\\partial f}{\\partial x}",
  "\\fdv{F}{g}": "\\frac{\\delta F}{\\delta g}",

  "\\dd": "\\mathrm{d}",
  "\\dd{x}": "\\mathrm{d}x",
  "a\\dd+b": "a\\mathrm{d}+b",
  "\\var": "\\delta",

  "\\qty{\\frac{a}{b}}": "\\left(\\frac{a}{b}\\right)",
  "\\abs{x}": "\\left|x\\right|",
  "\\eval{x}_0^\\infty": "\\left.x\\right|_0^\\infty",
  "\\braket{\\phi}{\\psi}": "\\left\\langle \\phi\\middle|\\psi\\right\\rangle",
  "\\expval{A}": "\\left\\langle A\\right\\rangle",
};














export function katexOptionsFor(enablePhysics: boolean): KatexOptions {
  return {
    throwOnError: false,
    macros: enablePhysics ? { ...PHYSICS_MACROS } : {},
  };
}

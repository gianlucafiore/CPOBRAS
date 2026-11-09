// Decimal strings from Rust stay exact until presentation. Never use Number for costs.
function parse(value) {
  const text = String(value ?? "0").trim();
  const match = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(text);
  if (!match) throw new TypeError("Decimal inválido");
  const fraction = match[3] || "";
  const coefficient = BigInt(match[2] + fraction);
  return { coefficient: match[1] === "-" ? -coefficient : coefficient, scale: fraction.length };
}

const power = scale => 10n ** BigInt(scale);

export function sumDecimals(values) {
  const decimals = values.map(parse);
  const scale = decimals.reduce((largest, value) => Math.max(largest, value.scale), 0);
  const sum = decimals.reduce((total, value) =>
    total + value.coefficient * power(scale - value.scale), 0n);
  const digits = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, "0");
  return (sum < 0n ? "-" : "") + (scale
    ? digits.slice(0, -scale) + "." + digits.slice(-scale)
    : digits);
}

export function absoluteDecimal(value) {
  parse(value);
  return String(value ?? "0").trim().replace(/^[+-]/, "");
}

function format(value, minimum, maximum) {
  try {
    const { coefficient, scale } = parse(value);
    let magnitude = coefficient < 0n ? -coefficient : coefficient;
    if (scale > maximum) {
      const divisor = power(scale - maximum);
      // Half away from zero, matching the previous locale formatting convention.
      magnitude = magnitude / divisor + (magnitude % divisor * 2n >= divisor ? 1n : 0n);
    } else {
      magnitude *= power(maximum - scale);
    }
    const digits = magnitude.toString().padStart(maximum + 1, "0");
    const integer = (maximum ? digits.slice(0, -maximum) : digits)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    let fraction = maximum ? digits.slice(-maximum) : "";
    while (fraction.length > minimum && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
    return (coefficient < 0n && magnitude !== 0n ? "-" : "") + integer + (fraction ? "," + fraction : "");
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // Invalid amounts must never look like legitimate zero costs.
    return "—";
  }
}

export const money = value => format(value, 2, 2);
export const numeric = value => format(value, 0, 4);

export function multiplyDecimals(left, right) {
  const a = parse(left), b = parse(right), product = a.coefficient * b.coefficient;
  const scale = a.scale + b.scale, magnitude = (product < 0n ? -product : product).toString().padStart(scale + 1, "0");
  return (product < 0n ? "-" : "") + (scale ? magnitude.slice(0, -scale) + "." + magnitude.slice(-scale) : magnitude);
}

export function percentageOf(value,percent){
 const p=parse(multiplyDecimals(value,percent)),scale=p.scale+2;
 const digits=(p.coefficient<0n?-p.coefficient:p.coefficient).toString().padStart(scale+1,'0');
 return ((p.coefficient<0n?'-':'')+digits.slice(0,-scale)+'.'+digits.slice(-scale)).replace(/0+$/,'').replace(/\.$/,'');
}

export function compareDecimals(left,right){const a=parse(left),b=parse(right),scale=Math.max(a.scale,b.scale),x=a.coefficient*power(scale-a.scale),y=b.coefficient*power(scale-b.scale);return x<y?-1:x>y?1:0;}

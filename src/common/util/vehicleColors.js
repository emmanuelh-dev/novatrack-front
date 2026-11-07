export const vehicleColors = [
  { id: 'white', hex: '#f5f5f2', shades: ['#8e9ca8', '#eef3f6', '#ffffff', '#d9e2e8', '#7d8c99'] },
  { id: 'grey', hex: '#939ba4', shades: ['#4b5662', '#a0aab5', '#d0d9e1', '#89949f', '#404b57'] },
  { id: 'black', hex: '#24272c', shades: ['#171b21', '#4b5561', '#7d8998', '#343d48', '#12171d'] },
  { id: 'blue', hex: '#165aff', shades: ['#123394', '#2465ff', '#4b82ff', '#0d53f5', '#102785'] },
  { id: 'orange', hex: '#ff7900', shades: ['#a14300', '#ff8508', '#ffae24', '#f66a00', '#833400'] },
  { id: 'yellow', hex: '#ffd000', shades: ['#a77500', '#ffd000', '#ffe32a', '#f5c000', '#855a00'] },
  { id: 'red', hex: '#e5163c', shades: ['#7a0a22', '#ee173c', '#ff3c5e', '#d90e31', '#640519'] },
];

export const vehicleColor = (value) =>
  vehicleColors.some(({ id }) => id === value) ? value : 'white';

export const colorizeVehicleSvg = (svg, value) => {
  const { shades } = vehicleColors.find(({ id }) => id === vehicleColor(value));
  const original = ['#174877', '#3d9be5', '#65b8f2', '#2684cd', '#173f69'];
  const colors = Object.fromEntries(original.map((hex, index) => [hex, shades[index]]));
  Object.assign(colors, {
    '#68b9ee': shades[2],
    '#307fba': shades[3],
    '#a7d8f5': shades[2],
    '#28689a': shades[0],
    '#9ad1f2': shades[2],
  });
  return svg.replace(/#[a-f\d]{6}/gi, (hex) => colors[hex.toLowerCase()] || hex);
};

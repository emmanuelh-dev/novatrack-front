export const vehicleColors = [
  { id: 'white', hex: '#f5f5f2', shades: ['#acb3b8', '#ffffff', '#ffffff', '#d9e2e8', '#b4babf'] },
  { id: 'grey', hex: '#828589', shades: ['#475059', '#4f5153', '#d0d9e1', '#89949f', '#404b57'] },
  { id: 'black', hex: '#24272c', shades: ['#171b21', '#4b5561', '#767d85', '#343d48', '#12171d'] },
  { id: 'blue', hex: '#165aff', shades: ['#123394', '#2465ff', '#4b82ff', '#0d53f5', '#102785'] },
  { id: 'orange', hex: '#ff7900', shades: ['#de4600', '#ff7700', '#ffae24', '#f66a00', '#a14102'] },
  { id: 'yellow', hex: '#fece11', shades: ['#a77500', '#fece11', '#ffe32a', '#f5c000', '#855a00'] },
  { id: 'red', hex: '#e5163c', shades: ['#9e0606', '#ee173c', '#ff3c5e', '#d90e31', '#640505'] },
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

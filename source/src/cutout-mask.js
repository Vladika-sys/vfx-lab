export function keepSeedComponent(values, width, height, point) {
  const length = width * height, marked = new Uint8Array(length), queue = new Int32Array(length);
  const x = Math.min(width-1,Math.max(0,Math.floor(point.x*width))), y = Math.min(height-1,Math.max(0,Math.floor(point.y*height)));
  let seed = y*width+x;
  if(values[seed]<.45){
    let nearest=Infinity;seed=-1;
    for(let i=0;i<length;i++)if(values[i]>=.45){const distance=(i%width-x)**2+(Math.floor(i/width)-y)**2;if(distance<nearest){nearest=distance;seed=i;}}
  }
  if(seed<0)return new Float32Array(length);
  let head=0,tail=1;queue[0]=seed;marked[seed]=1;
  const visit=index=>{if(!marked[index]&&values[index]>=.45){marked[index]=1;queue[tail++]=index;}};
  while(head<tail){const index=queue[head++],column=index%width;if(column)visit(index-1);if(column<width-1)visit(index+1);if(index>=width)visit(index-width);if(index<length-width)visit(index+width);}
  const output=new Float32Array(length);
  for(let i=0;i<length;i++){
    const column=i%width;
    if(marked[i]||(column&&marked[i-1])||(column<width-1&&marked[i+1])||(i>=width&&marked[i-width])||(i<length-width&&marked[i+width]))output[i]=values[i];
  }
  return output;
}

export function mergeCutoutRegion(previous, region, erase = false) {
  const output = previous || new Float32Array(region.length);
  for (let i = 0; i < region.length; i++) output[i] = erase ? Math.min(output[i], 1 - region[i]) : Math.max(output[i], region[i]);
  return output;
}

export function eraseColorRegion(previous, pixels, width, height, point, tolerance = 36) {
  if (!previous) return previous;
  const x = Math.max(0, Math.min(width - 1, Math.floor(point.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(point.y * height)));
  const seed = y * width + x;
  if (previous[seed] < .1) return previous;
  const marked = new Uint8Array(width * height), queue = new Int32Array(width * height);
  const color = [pixels[seed * 4], pixels[seed * 4 + 1], pixels[seed * 4 + 2]], limit = tolerance ** 2 * 3;
  let head = 0, tail = 1; queue[0] = seed; marked[seed] = 1;
  const visit = index => {
    if (marked[index] || previous[index] < .1) return;
    const distance = color.reduce((sum, value, channel) => sum + (pixels[index * 4 + channel] - value) ** 2, 0);
    if (distance > limit) return;
    marked[index] = 1; queue[tail++] = index;
  };
  while (head < tail) {
    const index = queue[head++], column = index % width;
    if (column) visit(index - 1); if (column < width - 1) visit(index + 1);
    if (index >= width) visit(index - width); if (index < width * (height - 1)) visit(index + width);
  }
  for (let i = 0; i < marked.length; i++) if (marked[i]) previous[i] = 0;
  return previous;
}

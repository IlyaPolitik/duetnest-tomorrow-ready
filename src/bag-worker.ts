import * as tf from '@tensorflow/tfjs';
import { load } from '@tensorflow-models/coco-ssd';
self.onmessage = async (event: MessageEvent<{pixels:Uint8ClampedArray;width:number;height:number}>) => {
  let model: Awaited<ReturnType<typeof load>> | undefined;
  let image: tf.Tensor3D | undefined;
  try {
    self.postMessage({status:'loading'});
    await tf.setBackend('cpu'); await tf.ready();
    model = await load({base:'lite_mobilenet_v2',modelUrl:'/bag-model/model.json'});
    const {pixels,width,height} = event.data;
    image = tf.tidy(()=>tf.tensor3d(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),[height,width,4],'int32').slice([0,0,0],[height,width,3]) as tf.Tensor3D);
    self.postMessage({status:'detecting'});
    const result = await model.detect(image,20,.6);
    const observations = result.map(o=> {
      const x=Math.max(0,Math.min(1,o.bbox[0]/width)), y=Math.max(0,Math.min(1,o.bbox[1]/height));
      return {kind:o.class,score:o.score,box:[x,y,Math.max(0,Math.min(1-x,o.bbox[2]/width)),Math.max(0,Math.min(1-y,o.bbox[3]/height))]};
    }).filter(o=>o.box[2]>0&&o.box[3]>0);
    self.postMessage({status:'ok',observations});
  } catch { self.postMessage({status:'error',reason:'On-device recognition is unavailable. Check the model files or review items manually.'}); }
  finally { image?.dispose(); model?.dispose(); }
};

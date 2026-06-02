import { useRef, useEffect, useState } from 'react';
import { Image as KonvaImage, Transformer, Group } from 'react-konva';
import Konva from 'konva';
import { CollageImage, MaskData, Tool } from '../types';

interface Props {
  image: CollageImage;
  isSelected: boolean;
  tool: Tool;
  onSelect: () => void;
  onChange: (changes: Partial<CollageImage>) => void;
}

function buildClipFunc(mask: MaskData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx: any) => {
    ctx.beginPath();
    switch (mask.type) {
      case 'circle':
        ctx.arc(mask.cx, mask.cy, mask.radius, 0, Math.PI * 2);
        break;
      case 'rect':
        ctx.rect(mask.x, mask.y, mask.width, mask.height);
        break;
      case 'polygon':
        if (mask.points.length < 3) return;
        ctx.moveTo(mask.points[0].x, mask.points[0].y);
        for (let i = 1; i < mask.points.length; i++) {
          ctx.lineTo(mask.points[i].x, mask.points[i].y);
        }
        ctx.closePath();
        break;
    }
  };
}

export function CollageImageNode({ image, isSelected, tool, onSelect, onChange }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const element = new window.Image();
    element.src = image.src;
    element.onload = () => setImg(element);
  }, [image.src]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!img) return null;

  const isMaskTool = tool.startsWith('mask-');
  const isSelectable = tool === 'select' || isMaskTool;

  return (
    <>
      <Group
        ref={groupRef}
        x={image.x}
        y={image.y}
        offsetX={image.width / 2}
        offsetY={image.height / 2}
        scaleX={image.scaleX}
        scaleY={image.scaleY}
        rotation={image.rotation}
        draggable={tool === 'select'}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
          });
        }}
        clipFunc={image.mask ? buildClipFunc(image.mask) : undefined}
      >
        <KonvaImage
          ref={imageRef}
          image={img}
          width={image.width}
          height={image.height}
          opacity={image.opacity}
        />
      </Group>
      {isSelected && isSelectable && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          enabledAnchors={
            isMaskTool
              ? [] // disable resizing while in mask drawing mode
              : [
                  'top-left',
                  'top-right',
                  'bottom-left',
                  'bottom-right',
                  'middle-left',
                  'middle-right',
                  'top-center',
                  'bottom-center',
                ]
          }
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}

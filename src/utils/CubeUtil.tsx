import { HTMLContainer, Rectangle2d, ShapeUtil, TLBaseShape } from 'tldraw';

type CubeShape = TLBaseShape<'cube', { w: number, h: number }>;

export class CubeUtil extends ShapeUtil<CubeShape> {
    static override type = 'cube' as const;

    getDefaultProps(): CubeShape['props'] {
        return {
            w: 100,
            h: 100,
        }
    }

    getGeometry(shape: CubeShape) {
        return new Rectangle2d({
            width: shape.props.w,
            height: shape.props.h,
            isFilled: true,
        })
    }

    component(shape: CubeShape) {
        return <HTMLContainer>test</HTMLContainer>
    }

    indicator(shape: CubeShape) {
        return <rect width={shape.props.w} height={shape.props.h} />
    }
}
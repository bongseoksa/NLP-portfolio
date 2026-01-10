# Panda CSS Usage Rules

This document outlines the rules and best practices for using Panda CSS library in the Fromm store frontend application.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Core Concepts](#core-concepts)
- [Styling Approaches](#styling-approaches)
- [Design Tokens](#design-tokens)
- [Responsive Design](#responsive-design)
- [Conditions and States](#conditions-and-states)
- [Variants](#variants)
- [Type Safety](#type-safety)
- [Performance](#performance)
- [Common Patterns](#common-patterns)

## Overview

Panda CSS is a build-time CSS-in-JS library that provides type-safe styling with zero runtime overhead. It generates static CSS at build time while maintaining the developer experience of CSS-in-JS.

### Why Panda CSS?

- **Zero Runtime**: All styles are extracted at build time
- **Type Safety**: Full TypeScript support with autocomplete
- **Performance**: Minimal CSS bundle size with atomic CSS
- **Developer Experience**: Familiar CSS-in-JS API with modern features
- **Design Tokens**: First-class support for design systems

## Configuration

### Required Setup

After any changes to `panda.config.ts`, you must regenerate the styled-system:

```bash
# Regenerate Panda CSS types and styles
pnpm prepare

# Watch mode for development (auto-regenerates on config changes)
pnpm panda:watch
```

**Important**: Always run `pnpm prepare` after modifying `panda.config.ts` to regenerate the styled-system types and CSS variables.

### Configuration File Location

The Panda CSS configuration is located at:
- [panda.config.ts](../panda.config.ts)

## Core Concepts

### 1. styled() Function

The primary way to create styled components:

```typescript
import { styled } from 'styled-system/jsx';

const Button = styled('button', {
    base: {
        padding: '0.5rem 1rem',
        borderRadius: '0.25rem',
        backgroundColor: 'surface.accent',
        color: 'text.inverse'
    }
});
```

### 2. css() Function

For creating style objects that can be applied via className:

```typescript
import { css } from 'styled-system/css';

const buttonStyles = css({
    padding: '0.5rem 1rem',
    backgroundColor: 'surface.accent'
});

// Usage: <button className={buttonStyles}>Click me</button>
```

### 3. Design Token Reference

Panda CSS uses a token-based design system. Always prefer tokens over hardcoded values:

```typescript
// ✅ Good - using design tokens
backgroundColor: 'surface.basic_01'
color: 'text.strong'
textStyle: 'Heading4_600'

// ❌ Bad - hardcoded values
backgroundColor: '#FFFFFF'
color: '#000000'
fontSize: '1.5rem'
```

## Styling Approaches

### Method 1: styled() with base (Recommended)

Best for components with fixed styles and variants:

```typescript
export const Container = styled('div', {
    base: {
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        backgroundColor: 'surface.basic_01'
    }
});
```

### Method 2: styled() with variants

Best for components with multiple style variations:

```typescript
export const Button = styled('button', {
    base: {
        padding: '0.5rem 1rem',
        borderRadius: '0.25rem',
        transition: 'all 0.2s'
    },
    variants: {
        size: {
            small: { padding: '0.25rem 0.5rem' },
            medium: { padding: '0.5rem 1rem' },
            large: { padding: '0.75rem 1.5rem' }
        },
        variant: {
            primary: { backgroundColor: 'surface.accent' },
            secondary: { backgroundColor: 'surface.basic_02' },
            ghost: { backgroundColor: 'transparent' }
        }
    }
});

// Usage: <Button size="large" variant="primary">Click me</Button>
```

### Method 3: css() for dynamic styles

Best for conditionally applied styles or utility classes:

```typescript
import { css } from 'styled-system/css';

const getDynamicStyle = (isActive: boolean) => css({
    opacity: isActive ? 1 : 0.5,
    cursor: isActive ? 'pointer' : 'not-allowed'
});
```

### Method 4: styledPoly (Alternative)

Alternative approach using css() within styledPoly:

```typescript
export const Container = styledPoly('div', css({
    boxSizing: 'border-box',
    width: '18.3125rem',
    backgroundColor: 'surface.basic_01'
}));
```

## Design Tokens

### Color Tokens

Colors are organized by semantic purpose:

```typescript
// Surface colors (backgrounds)
backgroundColor: 'surface.basic_01'
backgroundColor: 'surface.basic_02'
backgroundColor: 'surface.accent'
backgroundColor: 'surface.primary_subtle'

// Text colors
color: 'text.strong'
color: 'text.normal'
color: 'text.subtle'
color: 'text.inverse'

// Border colors
borderColor: 'border.primary'
borderColor: 'border.normal'
borderColor: 'border.subtle'

// Dim/opacity tokens (use numeric keys)
backgroundColor: 'dim.70'  // ✅ Correct
backgroundColor: 'dim.70%' // ❌ Wrong
```

### Typography Tokens

Use `textStyle` for typography instead of individual font properties:

```typescript
// ✅ Good - using textStyle token
textStyle: 'Heading1_700'
textStyle: 'Heading4_600'
textStyle: 'Body1_400'
textStyle: 'Caption_400'

// ❌ Bad - manually setting font properties
fontSize: '1.5rem'
fontWeight: 700
lineHeight: 1.5
```

### Spacing Tokens

Use consistent spacing values:

```typescript
padding: '1rem'
margin: '0.5rem'
gap: '0.25rem'
```

### Z-Index Tokens

Use semantic z-index tokens for layering:

```typescript
// If defined as design token
zIndex: 'modalZIndex'
zIndex: 'tooltipZIndex'

// Or use numeric values
zIndex: 10
zIndex: 100
```

### Aspect Ratio

```typescript
// Before (styled-components)
paddingBottom: ${AspectRatio['1/1']}

// After (Panda CSS)
aspectRatio: '1/1'
aspectRatio: '16/9'
aspectRatio: '4/3'
```

## Responsive Design

### Breakpoints (No underscore prefix)

Use breakpoint names directly for responsive styles:

```typescript
const Container = styled('div', {
    base: {
        width: '100%',
        // Mobile-first approach
        fontSize: '1rem',

        // Tablet
        tablet: {
            fontSize: '1.25rem',
            maxWidth: '768px'
        },

        // Desktop
        pc: {
            fontSize: '1.5rem',
            maxWidth: '1200px'
        }
    }
});
```

**Available breakpoints** (check `panda.config.ts` for exact values):
- `tablet`: Tablet screens
- `pc`: Desktop screens
- Other custom breakpoints as defined in config

### Custom Media Queries

For breakpoints not defined in config:

```typescript
'@media (min-width: 1440px)': {
    maxWidth: 'none'
}

'@media (max-width: 480px)': {
    padding: '0.5rem'
}
```

## Conditions and States

### Built-in Conditions (Use underscore prefix)

Panda provides utility conditions for common states:

```typescript
const Button = styled('button', {
    base: {
        opacity: 1,
        cursor: 'pointer',

        // Hover state
        _hover: {
            opacity: 0.8
        },

        // Focus state
        _focus: {
            outline: '2px solid',
            outlineColor: 'border.primary'
        },

        // Active state
        _active: {
            transform: 'scale(0.98)'
        },

        // Disabled state
        _disabled: {
            opacity: 0.32,
            cursor: 'not-allowed'
        },

        // Focus visible (keyboard navigation)
        _focusVisible: {
            outline: '2px solid',
            outlineColor: 'border.primary'
        }
    }
});
```

### Custom Conditions

Custom conditions defined in `panda.config.ts`:

```typescript
const Container = styled('div', {
    base: {
        width: '2.125rem',

        // Custom responsive condition
        _fold: {
            width: '2.75rem'
        },

        // Other custom conditions as defined
        _aboveMaxWidth: {
            maxWidth: 'none'
        }
    }
});
```

**Important**: All conditions (built-in and custom) must be placed **inside** the `base` object.

### Attribute-based Conditions

For data attributes or aria attributes:

```typescript
// Using condition helper
_disabled: {
    opacity: 0.32
}

// Or explicit attribute selector
'&[aria-disabled="true"]': {
    opacity: 0.32
}

'&[data-expanded="true"]': {
    maxHeight: '100rem'
}

'&[data-state="active"]': {
    backgroundColor: 'surface.accent'
}
```

## Variants

### Single Variant

```typescript
const Button = styled('button', {
    base: {
        padding: '0.5rem 1rem'
    },
    variants: {
        variant: {
            primary: {
                backgroundColor: 'surface.accent',
                color: 'text.inverse'
            },
            secondary: {
                backgroundColor: 'surface.basic_02',
                color: 'text.strong'
            },
            ghost: {
                backgroundColor: 'transparent',
                color: 'text.strong'
            }
        }
    }
});

// Usage: <Button variant="primary">Click</Button>
```

### Multiple Variants

```typescript
const Button = styled('button', {
    base: {
        borderRadius: '0.25rem',
        transition: 'all 0.2s'
    },
    variants: {
        size: {
            small: { padding: '0.25rem 0.5rem', textStyle: 'Caption_400' },
            medium: { padding: '0.5rem 1rem', textStyle: 'Body2_400' },
            large: { padding: '0.75rem 1.5rem', textStyle: 'Body1_600' }
        },
        variant: {
            primary: { backgroundColor: 'surface.accent' },
            secondary: { backgroundColor: 'surface.basic_02' }
        },
        fullWidth: {
            true: { width: '100%' }
        }
    }
});

// Usage: <Button size="large" variant="primary" fullWidth>Click</Button>
```

### Boolean Variants

```typescript
const Component = styled('div', {
    base: {
        opacity: 1
    },
    variants: {
        active: {
            true: {
                backgroundColor: 'surface.accent',
                color: 'text.inverse'
            }
        },
        disabled: {
            true: {
                opacity: 0.32,
                cursor: 'not-allowed'
            }
        }
    }
});

// Usage: <Component active={true} disabled={false} />
```

### Default Variants

```typescript
const Button = styled('button', {
    base: { ... },
    variants: {
        variant: {
            primary: { ... },
            secondary: { ... }
        },
        size: {
            small: { ... },
            medium: { ... },
            large: { ... }
        }
    },
    defaultVariants: {
        variant: 'primary',
        size: 'medium'
    }
});

// Usage: <Button /> renders as primary + medium by default
```

### Compound Variants

For styles that depend on multiple variant combinations:

```typescript
const Button = styled('button', {
    base: { ... },
    variants: {
        variant: {
            primary: { backgroundColor: 'surface.accent' },
            ghost: { backgroundColor: 'transparent' }
        },
        size: {
            small: { padding: '0.25rem' },
            large: { padding: '1rem' }
        }
    },
    compoundVariants: [
        {
            variant: 'ghost',
            size: 'large',
            css: {
                border: '2px solid',
                borderColor: 'border.primary'
            }
        }
    ]
});
```

## Type Safety

### Leveraging Generated Types

Panda generates TypeScript types for all styled components:

```typescript
import { ComponentProps } from 'react';

const Button = styled('button', {
    variants: {
        variant: {
            primary: { ... },
            secondary: { ... }
        }
    }
});

// Type-safe props
type ButtonProps = ComponentProps<typeof Button>;

// Usage in component
const MyButton = (props: ButtonProps) => {
    return <Button {...props} />;
};
```

### Extracting Variant Props

```typescript
import { RecipeVariantProps } from 'styled-system/types';

const Button = styled('button', {
    variants: { ... }
});

type ButtonVariants = RecipeVariantProps<typeof Button>;
// ButtonVariants will have all variant keys with proper types
```

### Custom Props with Variants

```typescript
interface CustomButtonProps extends ComponentProps<typeof Button> {
    onClick: () => void;
    loading?: boolean;
}

const CustomButton = ({ onClick, loading, ...styleProps }: CustomButtonProps) => {
    return (
        <Button
            {...styleProps}
            onClick={loading ? undefined : onClick}
            _disabled={loading}
        >
            {loading ? 'Loading...' : 'Click me'}
        </Button>
    );
};
```

## Performance

### Atomic CSS Generation

Panda generates atomic CSS classes, which means:
- Reusable style properties share the same class
- Smaller CSS bundle size
- Better caching

### Build-time Optimization

All styles are extracted at build time:
- Zero runtime overhead
- No styled-components runtime
- Static CSS files

### Best Practices for Performance

1. **Use design tokens**: Enables better optimization and deduplication
   ```typescript
   // ✅ Good
   backgroundColor: 'surface.basic_01'

   // ❌ Bad
   backgroundColor: '#FFFFFF'
   ```

2. **Prefer variants over dynamic styles**: Better for static extraction
   ```typescript
   // ✅ Good
   variants: {
       active: {
           true: { backgroundColor: 'surface.accent' }
       }
   }

   // ❌ Less optimal
   backgroundColor: isActive ? 'surface.accent' : 'surface.basic_01'
   ```

3. **Group related styles**: Reduces the number of generated classes
   ```typescript
   // ✅ Good
   const cardStyles = {
       padding: '1rem',
       borderRadius: '0.5rem',
       backgroundColor: 'surface.basic_01'
   }

   // ❌ Bad - scattered across multiple components
   ```

## Common Patterns

### Layout Components

```typescript
export const Stack = styled('div', {
    base: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
    },
    variants: {
        direction: {
            vertical: { flexDirection: 'column' },
            horizontal: { flexDirection: 'row' }
        },
        spacing: {
            tight: { gap: '0.5rem' },
            normal: { gap: '1rem' },
            loose: { gap: '1.5rem' }
        },
        align: {
            start: { alignItems: 'flex-start' },
            center: { alignItems: 'center' },
            end: { alignItems: 'flex-end' }
        }
    }
});
```

### Modal/Overlay Components

```typescript
export const Overlay = styled('div', {
    base: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'dim.70',
        zIndex: 'modalZIndex',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    }
});

export const Modal = styled('div', {
    base: {
        position: 'relative',
        backgroundColor: 'surface.basic_01',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        zIndex: 'modalZIndex'
    }
});
```

### Card Components

```typescript
export const Card = styled('div', {
    base: {
        backgroundColor: 'surface.basic_01',
        borderRadius: '0.5rem',
        padding: '1rem',
        border: '1px solid',
        borderColor: 'border.subtle',
        transition: 'all 0.2s',

        _hover: {
            borderColor: 'border.normal',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }
    },
    variants: {
        interactive: {
            true: {
                cursor: 'pointer',
                _active: {
                    transform: 'scale(0.98)'
                }
            }
        }
    }
});
```

### Animations

```typescript
// Define keyframes in panda.config.ts first
export const FadeIn = styled('div', {
    base: {
        animation: 'fadeIn 0.3s ease-in-out'
    }
});

export const SlideUp = styled('div', {
    base: {
        animation: 'slideUp 0.3s ease-out'
    }
});

// Using data attributes for conditional animation
export const AnimatedContainer = styled('div', {
    base: {
        opacity: 0,
        transform: 'translateY(20px)',
        transition: 'all 0.3s ease-out',

        '&[data-visible="true"]': {
            opacity: 1,
            transform: 'translateY(0)'
        }
    }
});
```

### Truncate Text

```typescript
export const TruncateText = styled('p', {
    base: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    variants: {
        lines: {
            1: {
                display: 'block'
            },
            2: {
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                whiteSpace: 'normal'
            },
            3: {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                whiteSpace: 'normal'
            }
        }
    }
});
```

### Grid Layouts

```typescript
export const Grid = styled('div', {
    base: {
        display: 'grid',
        gap: '1rem'
    },
    variants: {
        columns: {
            1: { gridTemplateColumns: '1fr' },
            2: { gridTemplateColumns: 'repeat(2, 1fr)' },
            3: { gridTemplateColumns: 'repeat(3, 1fr)' },
            4: { gridTemplateColumns: 'repeat(4, 1fr)' }
        },
        responsive: {
            true: {
                gridTemplateColumns: '1fr',
                tablet: {
                    gridTemplateColumns: 'repeat(2, 1fr)'
                },
                pc: {
                    gridTemplateColumns: 'repeat(4, 1fr)'
                }
            }
        }
    }
});
```

## Debugging

### Viewing Generated Classes

To see what classes Panda generates:

1. Inspect the element in browser DevTools
2. Generated classes follow the pattern: `[property]_[value]`
3. Check `styled-system/` directory for generated types

### Common Issues

1. **Styles not applying**: Make sure you ran `pnpm prepare` after config changes
2. **TypeScript errors**: Regenerate types with `pnpm prepare`
3. **Missing design tokens**: Check `panda.config.ts` for available tokens
4. **Conditions not working**: Ensure conditions are inside `base` object

## Additional Resources
- [Panda CSS Documentation](https://panda-css.com/docs)
- [panda.config.ts](../panda.config.ts) - Project configuration and design tokens

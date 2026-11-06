import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";

type Common = {
  tone?: "clear" | "accent";
  size?: "default" | "sm";
  contentClassName?: string;
};
type Props = Common &
  (
    | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
    | (AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        disabled?: boolean;
      })
  );

/** Plain Sandbox actions with native button and link behavior. */
export const SandboxButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  Props
>(function SandboxButton(
  {
    tone = "clear",
    size = "default",
    className,
    contentClassName: _contentClassName,
    ...props
  },
  ref,
) {
  const classes = [
    "sbx-button",
    `sbx-button--${tone}`,
    `sbx-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  if (props.href !== undefined) {
    const { disabled, ...link } = props;
    return (
      <a
        {...link}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : link.tabIndex}
        onClick={disabled ? (event) => event.preventDefault() : link.onClick}
      />
    );
  }
  return (
    <button
      type="button"
      {...props}
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
    />
  );
});

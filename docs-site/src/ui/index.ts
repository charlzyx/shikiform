/**
 * `@site/ui` — Inkstone（宣纸 Light / 玄墨 Dark）UI Component Kit for ShikiForm docs & Playground.
 * Powered by `@ui-sdk/react` primitives and connected to `@shikiform/react` via `connect` / `mapProps` / `useFieldDecorator`.
 */

// Raw UI primitives
export {
  Button,
  Checkbox,
  CheckboxGroup,
  Combobox,
  cx,
  DatePicker,
  Input,
  NumberInput,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Textarea,
} from './primitives'
export type {
  ButtonProps,
  CheckboxGroupProps,
  CheckboxProps,
  ComboboxProps,
  ControlSize,
  DatePickerProps,
  InputProps,
  NumberInputProps,
  RadioGroupProps,
  SelectOption,
  SelectProps,
  SliderProps,
  SwitchProps,
  TextareaProps,
} from './primitives'

// Overlays, navigation & pagination
export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
  Pagination,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsRoot,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from './overlays'
export type {
  DialogProps,
  DrawerProps,
  PaginationProps,
  PopoverProps,
  TabItem,
  TabsProps,
  TooltipProps,
} from './overlays'

// Display, layout & data components
export {
  Alert,
  Badge,
  Card,
  Divider,
  Empty,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
} from './display'
export type {
  AlertProps,
  BadgeProps,
  CardProps,
  DividerProps,
  EmptyProps,
  TableProps,
  TagProps,
  ToolbarProps,
} from './display'

// ShikiForm-connected form kit
export {
  FieldCheckbox,
  FieldCheckboxGroup,
  FieldCombobox,
  FieldDatePicker,
  FieldInput,
  FieldNumber,
  FieldRadioGroup,
  FieldSelect,
  FieldSlider,
  FieldSwitch,
  FieldTextarea,
  FormItem,
  ReadOnlyBoolean,
  ReadOnlyDate,
  ReadOnlyEnum,
  ReadOnlyText,
  siteKit,
} from './form-kit'
export type { FormItemProps, ReadOnlyPreviewProps } from './form-kit'

// Crisp inline SVG icons
export {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  InboxIcon,
  InfoIcon,
  LoaderIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XCircleIcon,
  XIcon,
} from './icons'
export type { IconProps } from './icons'
